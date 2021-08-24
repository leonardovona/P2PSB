/**
 * ./test/test_contract.js
 * Leonardo Vona
 * 545042
 */ 

const Mayor = artifacts.require("Mayor");
const truffleAssert = require('truffle-assertions');

contract("Testing Mayor contract", accounts => {
	let elections;						// Contract instance representing an election   
	const owner = accounts[8];			// Owner of the contract. It is responsible for creation and deletion.
	const candidates = [accounts[0], accounts[1], accounts[2]];
	const voters = [accounts[4], accounts[5], accounts[6], accounts[7]];
	const escrow = accounts[3];
	const quorum = 4;
	
	// Before the execution of a test the environment is re-initialized creating a new contract
	beforeEach(async () => {
        elections = await Mayor.new([candidates[0], candidates[1], candidates[2]], escrow, quorum,  { from: owner });
   	});

	// After the execution of a test the contract is destroyed
    afterEach(async () => {
        await elections.kill({ from: owner });
    });

	
	it("Should test the constructor", async function() {
		// Verifies that the owner of the contract is correct
		const _owner = await elections.owner();
		assert.equal(_owner, owner, "The owner should be the account 9");
	
		// Verifies that the account 0, 1 and 2 are effectively candidates (checks if the field isCandidate of the struct Candidate is set to true)
		const _candidate0 = await elections.candidates(candidates[0]);
		assert.equal(_candidate0[4], true, "The account 0 should be a candidate");

		const _candidate1 = await elections.candidates(candidates[1]);
		assert.equal(_candidate1[4], true, "The account 1 should be a candidate");
		
		const _candidate2 = await elections.candidates(candidates[2]);
		assert.equal(_candidate2[4], true, "The account 2 should be a candidate");
		
		// Verifies that an account different from 0, 1 and 2 is not considered as a candidate
		const _candidate8 = await elections.candidates(accounts[8]);
		assert.equal(_candidate8[4], false, "The account 8 should not be a candidate");
		
		// Verifies that the escrow is set correctly
		const _escrow = await elections.escrow();
		assert.equal(_escrow, escrow, "The escrow should be the account 3");
		
		// Verifies that the quorum is correct
		const voting_condition = await elections.voting_condition();
		assert.equal(voting_condition[1].toNumber(), quorum, "The quorum should be 4");
	});


	it("Should test an unvalid constructor", async function() {
		// Tests conditions where the constructor creation should fail

		// The list of candidate must contain at least two accounts
		await truffleAssert.reverts(Mayor.new([], escrow, quorum,  { from: owner }), 
			"There should be at least two candidates");
		
		await truffleAssert.reverts(Mayor.new([candidates[0]], escrow, quorum,  { from: owner }),
			"There should be at least two candidates");
		
		// The candidates must be valid accounts
		await truffleAssert.reverts(Mayor.new([candidates[0], candidates[1], '0x0000000000000000000000000000000000000000'], escrow, quorum,  { from: owner }),
			"The candidates should have a valid address");

		// The escrow must be a valid account
		await truffleAssert.reverts(Mayor.new([candidates[0], candidates[1], candidates[2]], '0x0000000000000000000000000000000000000000', quorum,  { from: owner }),
			"The escrow account must be specified");

		// The quorum must be greater than 1
		await truffleAssert.reverts(Mayor.new([candidates[0], candidates[1], candidates[2]], escrow, 0,  { from: owner }),
			"The quorum must be at least 1");
	});

	
	it("Should test a valid deposit", async function() {
		// The candidate 0 deposit 10 soul
		const tx = await elections.deposit({ from: candidates[0], value: 10});
		
		// Verifies that the event Deposit is emitted
		truffleAssert.eventEmitted(tx, 'Deposit');

		// Verifies that the 10 soul are part of the contract balance
		const balance = await web3.eth.getBalance(elections.address);
		assert.equal(balance, 10, "The balance of the contract should be 10");

		// Verifies that the count of the candidates that have deposited is 1
		const voting_condition = await elections.voting_condition();
		assert.equal(voting_condition[4].toNumber(), 1, "The candidate that have deposited should be 1");
		
		// Verifies that the flag 'deposited' of the struct Candidate for candidates[0] is set to true and that the soul deposited is 10
		const _candidate0 = await elections.candidates(candidates[0]);
		assert.equal(_candidate0[2], true, "The account 0 should have deposited");
		assert.equal(_candidate0[3].toNumber(), 10, "The soul deposited should be 10");
	});
	

	it("Should test an unvalid double deposit", async function() {
		await elections.deposit({ from: candidates[0], value: 10});

		// Verifies that the attempt to deposit twice from the same candidate leads to an error
		await truffleAssert.reverts(elections.deposit({ from: candidates[0], value: 10}), "You have already deposited");
	});


	it("Should test an unvalid deposit from a non-candidate", async function() {
		// Verifies that an account which is not a candidate is not allowed to deposit
		await truffleAssert.reverts(elections.deposit({ from: accounts[8], value: 10}), "You are not a candidate");
	});


	it("Should test an unvalid deposit when the deposit phase is closed", async function() {
		// All the candidates deposit their soul. The deposit phase closes
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 10});
		await elections.deposit({ from: candidates[2], value: 10});

		// If an account tries to deposit the operation should fail
		await truffleAssert.reverts(elections.deposit({ from: candidates[0], value: 10}), "Cannot deposit now, all the candidates have already deposited");
	});


	it("Should test a complete deposit phase", async function() {
		// All the candidates deposit their soul
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		// Verifies that the balance of the contract is the sum of the soul deposited by the candidates
		const balance = await web3.eth.getBalance(elections.address);
		assert.equal(balance, 35, "The balance of the contract should be 35");

		// Verifies that the number of candidates that have deposited corresponds to 3
		const voting_condition = await elections.voting_condition();
		assert.equal(voting_condition[4].toNumber(), 3, "The candidate that have deposited should be 3");
		
	});


	it("Should test an unvalid envelope casting when the deposit phase is not complete", async function() {
		const envelope = await elections.compute_envelope(101, candidates[0], 50);

		// The attempt to cast an envelope before the closure of the deposit phase should fail
		await truffleAssert.reverts(elections.cast_envelope(envelope, { from: voters[3] }), "Cannot vote now, candidates did not deposit soul");	
	});


	it("Should test a valid envelope casting", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		// A voter casts his envelope
		const envelope = await elections.compute_envelope(101, candidates[0], 50);
		const tx = await elections.cast_envelope(envelope, { from: voters[3] });

		// Verifies that the number of envelopes casted is 1
		const voting_condition = await elections.voting_condition();
		assert.equal(voting_condition[2].toNumber(), 1, "The envelopes casted should be 1");

		// Verifies that the casted envelope corresponds to the one sent
		const casted_envelope = await elections.envelopes(voters[3]);
		assert.equal(casted_envelope, envelope, "The casted envelope does not match");
		
		// Verifies that the event EnvelopeCast is emitted
		truffleAssert.eventEmitted(tx, 'EnvelopeCast');
	});


	it("Should test a valid double envelope casting", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		// The same voter casts two envelopes
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		const envelope = await elections.compute_envelope(202, candidates[1], 25);
		await elections.cast_envelope(envelope, { from: voters[3] });

		// The count of the envelopes casted should be 1
		const voting_condition = await elections.voting_condition();
		assert.equal(voting_condition[2].toNumber(), 1, "The envelopes casted should be 1");

		// The envelope associated to the voter should be the last one sent
		const casted_envelope = await elections.envelopes(voters[3]);
		assert.equal(casted_envelope, envelope, "The casted envelope does not match");
	});


	it("Should test a complete envelope casting phase", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		// Four voters cast an envelope, reaching the quorum
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[1], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(404, candidates[1], 26), { from: voters[0] });

		// Verifies that the overall number of envelopes casted is 4
		const voting_condition = await elections.voting_condition();
		assert.equal(voting_condition[2].toNumber(), 4, "The envelopes casted should be 4");
	});


	it("Should test an unvalid envelope casting when the envelope casting phase is completed", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[1], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(404, candidates[1], 26), { from: voters[0] });

		// The attempt to cast an envelope when the quorum has been reached should fail
		await truffleAssert.reverts(elections.cast_envelope(await elections.compute_envelope(505, candidates[0], 10), { from: accounts[4] }), 
			"Cannot vote now, voting quorum has been reached");	
	});


	it("Should test an unvalid envelope opening when the deposit phase is not completed", async function() {
		await elections.deposit({ from: candidates[0], value: 10});

		// The attempt to open an envelope before the completion of the deposit phase should fail
		await truffleAssert.reverts(elections.open_envelope(101, candidates[0], { from: voters[3], value: 10 }),
			"Cannot open an envelope, voting quorum not reached yet");
	});


	it("Should test an unvalid envelope opening when the casting phase is not completed", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		
		// The attempt to open an envelope before the casting phase is completed should fail
		await truffleAssert.reverts(elections.open_envelope(101, candidates[0], { from: voters[3], value: 10 }),
			"Cannot open an envelope, voting quorum not reached yet");
	});


	it("Should test a valid envelope opening", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[1], 26), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[1], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		
		// A valid opening of an envelope is made
		const tx = await elections.open_envelope(101, candidates[0], { from: voters[3], value: 50 });

		// Verifies that the voters[3] account is checked as voted
		const voter_address = await elections.voters_addresses(0);
		assert.equal(voter_address, voters[3], "An account that has voted should be in the voters");

		// Verifies that the candidate 0 has received 1 vote and 50 souls
		const _candidate = await elections.candidates(candidates[0]);
		assert.equal(_candidate[0], 1, "The candidate 0 should have 1 vote");
		assert.equal(_candidate[1], 50, "The candidate 0 should have 50 souls");

		// Verifies that the soul given by the voter 3 is 50, that is marked as voted and his / her vote is for the candidate 0
		const voter = await elections.voters(voters[3]);
		assert.equal(voter[0], 50, "The soul given by the voter should be 50");
		assert.equal(voter[1], candidates[0], "The voter should have voted the candidate 0");
		assert.equal(voter[2], true, "The vote should be registered");

		// Verifies that the event EnvelopeOpen is emmitted with attributes _soul equal to 50 and _symbol equal to candidate 0 address
		truffleAssert.eventEmitted(tx, 'EnvelopeOpen', (ev) => {
			return ev._soul == 50 && ev._symbol == candidates[0]; });
	});


	it("Should test an unvalid envelope opening from a non-voter", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[1], 26), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[1], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		
		// The attempt from an account that has not casted any votes to open an envelope should fail
		await truffleAssert.reverts(elections.open_envelope(101, candidates[0], { from: accounts[8], value: 50 }),
			"The sender has not casted any votes");
	});


	it("Should test an unvalid envelope opening because the envelope does not corresponds", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[1], 26), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[1], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		
		// If at least one of the parameter of the envelope does not correspond during the opening, the operation should fail
		// The sygil is wrong
		await truffleAssert.reverts(elections.open_envelope(102, candidates[0], { from: voters[3], value: 50 }),
			"Sent envelope does not correspond to the one casted");
		// The candidate is wrong
		await truffleAssert.reverts(elections.open_envelope(101, candidates[1], { from: voters[3], value: 50 }),
			"Sent envelope does not correspond to the one casted");
		// The soul sent is wrong
		await truffleAssert.reverts(elections.open_envelope(101, candidates[0], { from: voters[3], value: 49 }),
			"Sent envelope does not correspond to the one casted");
	});


	it("Should test an unvalid envelope opening because the envelope has already been opened", async function() {
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[1], 26), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[1], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		
		await elections.open_envelope(202, candidates[1], { from: voters[2], value: 25 });
		
		//The attempt to open again an envelope should fail
		await truffleAssert.reverts(elections.open_envelope(202, candidates[1], { from: voters[2], value: 25 }),
			"The sender has already opened its envelope and voted");
	});


	it("Should test an unvalid election because the previous phases are not completed", async function() {
		// The ballot phase can't be initiated before the completion of the deposit phase
		await truffleAssert.reverts(elections.mayor_or_sayonara(), "Cannot check the winner, need to open all the sent envelopes");
		
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		// The ballot phase can't be initiated before the completion of the casting phase
		await truffleAssert.reverts(elections.mayor_or_sayonara(), "Cannot check the winner, need to open all the sent envelopes");

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[1], 26), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[1], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		
		// The ballot phase can't be initiated before the completion of the opening phase
		await truffleAssert.reverts(elections.mayor_or_sayonara(), "Cannot check the winner, need to open all the sent envelopes");

		await elections.open_envelope(202, candidates[1], { from: voters[2], value: 25 });

		await truffleAssert.reverts(elections.mayor_or_sayonara(), "Cannot check the winner, need to open all the sent envelopes");
	});


	it("Should test a valid election with three candidates (the second one wins) and four voters", async function() {
		//The candidate 1 will win because it receives more soul
				
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[1], 26), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[1], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[0], 50), { from: voters[3] });
		
		await elections.open_envelope(404, candidates[1], { from: voters[0], value: 26 });
		await elections.open_envelope(303, candidates[2], { from: voters[1], value: 50 });
		await elections.open_envelope(202, candidates[1], { from: voters[2], value: 25 });
		await elections.open_envelope(101, candidates[0], { from: voters[3], value: 50 });

		// Retrieves the balances before the ballot begins
		let balances = []
		for(i = 0; i < 8; i++)
			balances[i] = BigInt(await web3.eth.getBalance(accounts[i]));

		// Calculates the expected balances after the completion of the ballot
		const expected_balances = [ balances[0], 
									balances[1] + BigInt(81),	// The winner should receive 51 souls from the voters and 30 souls from the other candidates
									balances[2],
									balances[3] + BigInt(1),	// The escrow should receive 1 soul leftover from the distribution of the deposit
									balances[4] + BigInt(2),	// The voter of the winner should receive floor(5 / 2) = 2 souls
									balances[5] + BigInt(50),	// The voter of a loser candidate should receive back his / her soul
									balances[6] + BigInt(2),	// The voter of the winner should receive floor(5 / 2) = 2 souls
									balances[7] + BigInt(50)];	// The voter of a loser candidate should receive back his / her soul

		const tx = await elections.mayor_or_sayonara({ from: owner });

		// Verifies that the event NewMayor is emitted with attribute _candidate equal to the new mayor (candidate 1)
		truffleAssert.eventEmitted(tx, 'NewMayor', (ev) => {
			return ev._candidate == candidates[1]; });
		

		/**
		 * Bug: In case of a failure of the assertion (one of the balances is not correct) the system reports
		 * 'TypeError: Do not know how to serialize a BigInt' because it is not able to serialize the balance
		 * and report it to the console log. 
		 */
		// Verifies that after the ballot the effective balances and the expected ones correspond
		for(i = 0 ; i < 8; i++)
			assert.equal(BigInt(await web3.eth.getBalance(accounts[i])), expected_balances[i], "Balance of account " + i + " is not correct");
	});
	
	it("Should test a valid election with three candidates (the first one wins) and four voters", async function() {
		//The candidate 0 will win because it receives the same soul of candidate 1 but more votes
				
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[0], 25), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[0], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[1], 50), { from: voters[3] });
		
		
		await elections.open_envelope(404, candidates[0], { from: voters[0], value: 25 });
		await elections.open_envelope(303, candidates[2], { from: voters[1], value: 50 });
		await elections.open_envelope(202, candidates[0], { from: voters[2], value: 25 });
		await elections.open_envelope(101, candidates[1], { from: voters[3], value: 50 });

		// Retrieves the balances before the ballot begins
		let balances = [];
		for(i = 0 ; i < 8 ; i++) 
			balances[i] = BigInt(await web3.eth.getBalance(accounts[i]));
		
		// Calculates the expected balances after the completion of the ballot
		const expected_balances = [ balances[0] + BigInt(75), 	// Candidate 0 is the winner, receives 50 souls from the voters and 25 from the other candidates
									balances[1],
									balances[2],
									balances[3],
									balances[4] + BigInt(5),	// THe winning voter should receive his part of the deposit
									balances[5] + BigInt(50),	// The losing voter should receive back his soul
									balances[6] + BigInt(5),	// THe winning voter should receive his part of the deposit
									balances[7] + BigInt(50)];	// The losing voter should receive back his soul

		const tx = await elections.mayor_or_sayonara({ from: owner });

		// Verifies that the event NewMayor is emitted with attribute _candidate equal to the new mayor (candidate 0)
		truffleAssert.eventEmitted(tx, 'NewMayor', (ev) => {
			return ev._candidate == candidates[0]; });
		
		// Verifies that after the ballot the effective balances and the expected ones correspond
		for(i = 0 ; i < 8; i++) {
			assert.equal(BigInt(await web3.eth.getBalance(accounts[i])), expected_balances[i], "Balance of account " + i + " is not correct");
		}
	});

	it("Should test a valid election with three candidates (tie) and four voters", async function() {
		//There is a tie between candidate 1 and candidate 2
				
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[0], 24), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[0], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[1], 50), { from: voters[3] });
		
		await elections.open_envelope(404, candidates[0], { from: voters[0], value: 24 });
		await elections.open_envelope(303, candidates[2], { from: voters[1], value: 50 });
		await elections.open_envelope(202, candidates[0], { from: voters[2], value: 25 });
		await elections.open_envelope(101, candidates[1], { from: voters[3], value: 50 });

		// Retrieves the balances before the ballot begins
		let balances = [];
		for(i = 0 ; i < 8 ; i++)
			balances[i] = BigInt(await web3.eth.getBalance(accounts[i]));

		// Calculates the expected balances after the completion of the ballot
		const expected_balances = [ balances[0], 
									balances[1],
									balances[2],
									balances[3] + BigInt(184),	// In case of a tie all the soul goes to the escrow account
									balances[4],
									balances[5],
									balances[6],
									balances[7]];

		const tx = await elections.mayor_or_sayonara({ from: owner });

		// Verifies that the event Tie is emitted
		truffleAssert.eventEmitted(tx, 'Tie');

		// Verifies that after the ballot the effective balances and the expected ones correspond
		for(i = 0 ; i < 8; i++)
			assert.equal(BigInt(await web3.eth.getBalance(accounts[i])), expected_balances[i], "Balance of account " + i + " is not correct");
	});
	
	it("Should test an unvalid double election", async function() {
				
		await elections.deposit({ from: candidates[0], value: 10});
		await elections.deposit({ from: candidates[1], value: 5});
		await elections.deposit({ from: candidates[2], value: 20});

		await elections.cast_envelope(await elections.compute_envelope(404, candidates[0], 24), { from: voters[0] });
		await elections.cast_envelope(await elections.compute_envelope(303, candidates[2], 50), { from: voters[1] });
		await elections.cast_envelope(await elections.compute_envelope(202, candidates[0], 25), { from: voters[2] });
		await elections.cast_envelope(await elections.compute_envelope(101, candidates[1], 50), { from: voters[3] });
		
		await elections.open_envelope(404, candidates[0], { from: voters[0], value: 24 });
		await elections.open_envelope(303, candidates[2], { from: voters[1], value: 50 });
		await elections.open_envelope(202, candidates[0], { from: voters[2], value: 25 });
		await elections.open_envelope(101, candidates[1], { from: voters[3], value: 50 });

		// A first valid election is called
		await elections.mayor_or_sayonara({ from: owner });

		// The attempt to call another election should fail
		await truffleAssert.reverts( elections.mayor_or_sayonara({ from: owner }), 'The ballot has been already completed');
	});

});