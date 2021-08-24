// SPDX-License-Identifier: GPL-3.0
/**
 * Mayor.sol
 * Leonardo Vona
 * 545042   
 */
pragma solidity ^0.8.1;

contract Mayor {
    
    // Data to manage voters
    struct Voter {
        uint soul;
        address symbol;
        bool voted;
    }
    
    // Data to manage the confirmation
    struct Conditions {
        bool ballot_completed;          // Indicates if the ballot (the mayor_or_sayonara() function) has been already executed
        uint32 quorum;
        uint32 envelopes_cast;
        uint32 envelopes_opened;    
        uint32 candidates_deposited;    // Number of candidates that have deposited the soul to give to the electors  
    }

	// Data to manage the candidates
    struct Candidate {
        uint votes;         // Number of votes received
        uint soul;          // Soul received from voters
        bool deposited;     // Indicates if the candidate has deposited the soul
        uint deposit;       // Soul to give to the electors
        bool isCandidate;   // Used to check if an address is a candidate or not
    }
    
    event NewMayor(address _candidate);                                 // Emitted if a new mayor is elected
    event Tie(address _escrow);                                         // Emitted if the ballot results in a tie
    event Deposit(address _candidate, uint _soul);                      // Emitted when a candidate deposits some soul
    event EnvelopeCast(address _voter);                                 // Emitted when an envelope is cast
    event EnvelopeOpen(address _voter, uint _soul, address _symbol);    // Emitted when an envelope is open
    
    // The voting phase can be opened only when all the candidates have deposited some soul for the electors
    modifier depositComplete() {
        require(voting_condition.candidates_deposited == candidates_addresses.length, "Cannot vote now, candidates did not deposit soul");
        _;
    }

    // The candidates can deposit only once
    modifier canDeposit() {
        require(voting_condition.candidates_deposited < candidates_addresses.length, "Cannot deposit now, all the candidates have already deposited");
        _;
    }

    // Someone can vote as long as the quorum is not reached
    modifier canVote() {
        require(voting_condition.envelopes_cast < voting_condition.quorum, "Cannot vote now, voting quorum has been reached");
        _;   
    }
    
    // Envelopes can be opened only after receiving the quorum
    modifier canOpen() {
        require(voting_condition.envelopes_cast == voting_condition.quorum, "Cannot open an envelope, voting quorum not reached yet");
        _;
    }
    
    // The outcome of the confirmation can be computed as soon as all the cast envelopes have been opened
    modifier canCheckOutcome() {
        require(voting_condition.envelopes_opened == voting_condition.quorum, "Cannot check the winner, need to open all the sent envelopes");
        _;
    }
    
    // The mayor_or_sayonara() function can be executed only once
    modifier ballotNotCompleted() {
        require(!voting_condition.ballot_completed, "The ballot has been already completed");
        _;
    }
    
    address payable public owner;                       // Owner of the contract
    mapping(address => Candidate) public candidates;    // Candidates data
    address[] public candidates_addresses;              // Addresses of the candidates
    address payable public escrow;                      // Escrow account
    mapping(address => bytes32) public envelopes;       // Envelopes sent by the voters
    Conditions public voting_condition;                 // Data to mamange the confirmation
    mapping(address => Voter) public voters;            // Voters data
    address[] public voters_addresses;                  // Addresses of the voters
    
    /// @notice The constructor initializes contract attributes
    /// @param _candidates (address[] memory) The addresses of the mayor candidates
    /// @param _escrow (address) The address of the escrow account
    /// @param _quorum (address) The number of voters required to finalize the confirmation
    constructor(address[] memory _candidates, address payable _escrow, uint32 _quorum) {
    	require(_candidates.length > 1, "There should be at least two candidates");
        require(_escrow != address(0), "The escrow account must be specified");
        require(_quorum > 0, "The quorum must be at least 1");

        owner = payable(msg.sender);

        candidates_addresses = _candidates;
        for(uint i = 0; i < _candidates.length; i++) {
            require(_candidates[i] != address(0), "The candidates should have a valid address");
            candidates[_candidates[i]].isCandidate = true;   
        }
    	
        escrow = _escrow;
    	voting_condition.quorum = _quorum;
    }

    /// @notice Deposit an amount of soul from a candidate
    /// @dev The soul is sent as crypto
    function deposit() canDeposit public payable{
        require(candidates[msg.sender].isCandidate, "You are not a candidate");     // Only a candidate can deposit
        require(!candidates[msg.sender].deposited, "You have already deposited");   // A candidate can deposit only once
        
        voting_condition.candidates_deposited++;
        
        candidates[msg.sender].deposited = true;
        candidates[msg.sender].deposit = msg.value;
        
        emit Deposit(msg.sender, msg.value);
    }


    /// @notice Store a received voting envelope
    /// @param _envelope The envelope represented as the keccak256 hash of (sigil, doblon, soul) 
    function cast_envelope(bytes32 _envelope) depositComplete canVote public {
        if(envelopes[msg.sender] == 0x0)
            voting_condition.envelopes_cast++;
        
        envelopes[msg.sender] = _envelope;

        emit EnvelopeCast(msg.sender);
    }
    

    /// @notice Open an envelope and store the vote information
    /// @param _sigil (uint) The secret sigil of a voter
    /// @param _symbol (address) The voting preference
    /// @dev The soul is sent as crypto
    /// @dev Need to recompute the hash to validate the envelope previously cast
    function open_envelope(uint _sigil, address _symbol) canOpen public payable{
        require(envelopes[msg.sender] != 0x0, "The sender has not cast any votes");
        
        bytes32 _cast_envelope = envelopes[msg.sender];

        bytes32 _sent_envelope = compute_envelope(_sigil, _symbol, msg.value);
        
        require(_cast_envelope == _sent_envelope, "Sent envelope does not correspond to the one cast");
		
		require(voters[msg.sender].voted == false, "The sender has already opened its envelope and voted");
		
		// The sender is a valid voter and didn't already opened its envelope
		
		voters_addresses.push(msg.sender);
		voting_condition.envelopes_opened++;

        candidates[_symbol].votes++;
        candidates[_symbol].soul += msg.value;

		voters[msg.sender].soul = msg.value;
		voters[msg.sender].symbol = _symbol;
		voters[msg.sender].voted = true;
		
		emit EnvelopeOpen(msg.sender, msg.value, _symbol);
    }
    
    /// @notice Eventually elects a candidate as mayor. Refund the electors who voted for the losing candidates
    function mayor_or_sayonara() canCheckOutcome ballotNotCompleted public {
        voting_condition.ballot_completed = true; // The function can be executed only once

        bool tie;
        
        address new_mayor = candidates_addresses[0];

        for(uint i = 1; i < candidates_addresses.length; i++) {
            if (candidates[candidates_addresses[i]].soul > candidates[new_mayor].soul) {
            	// The candidate has more soul than the actual winner
                new_mayor = candidates_addresses[i];
                tie = false;
            } else if (candidates[candidates_addresses[i]].soul == candidates[new_mayor].soul) {
                if(candidates[candidates_addresses[i]].votes > candidates[new_mayor].votes) {
                	// The candidate has the same amount of soul but more votes than the actual winner
                    new_mayor = candidates_addresses[i];
                    tie = false;
                } else if (candidates[candidates_addresses[i]].votes == candidates[new_mayor].votes) {
                	// The candidate and the potential winner have the same amount of soul and votes
                    tie = true;
                }
            }
        }

        if(tie) {
        	// In case of a tie all the soul is transfered to the escrow
            escrow.transfer(address(this).balance);
            emit Tie(escrow);
        } else {
            for (uint i = 0; i < voters_addresses.length; i++)
				if ( voters[voters_addresses[i]].symbol != new_mayor) 
					// Each "losing" voter is refunded 
					payable(voters_addresses[i]).transfer(voters[voters_addresses[i]].soul);
           	 	else
           	 		// Each "winning" voter receives his / her part of the soul deposited by the new mayor
                	payable(voters_addresses[i]).transfer(candidates[new_mayor].deposit / candidates[new_mayor].votes);
            
            // The new mayor receives the soul given by his / her voters
            payable(new_mayor).transfer(candidates[new_mayor].soul);
            
            // The new mayor receives the soul deposited by the other candidates
            for( uint i = 0; i < candidates_addresses.length; i++)
                if(candidates_addresses[i] != new_mayor)
                    payable(new_mayor).transfer(candidates[candidates_addresses[i]].deposit);

            // The left part of soul remaining due to the integer division of the deposit is given to the escrow
            escrow.transfer(address(this).balance);
            
            emit NewMayor(new_mayor);
        }
    }
 
    /// @notice Compute a voting envelope
    /// @param _sigil (uint) The secret sigil of a voter
    /// @param _symbol (address) The voting preference
    /// @param _soul (uint) The soul associated to the vote
    function compute_envelope(uint _sigil, address _symbol, uint _soul) public pure returns(bytes32) {
        return keccak256(abi.encode(_sigil, _symbol, _soul));
    }

    /// @notice Returns the number of candidates
    function get_number_of_candidates() public view returns(uint) {
        return candidates_addresses.length;
    }
    
    /// @notice Destroys the contract. Can be executed only by the owner of the contract
    function kill() external {
        require(msg.sender == owner, "Only the owner can kill this contract");
        selfdestruct(owner);
    }
    
}