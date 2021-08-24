/**
 * ./js/app.js
 * Leonardo Vona
 * 545042
 */

App = {

    contracts: {},
    web3Provider: null,             // Web3 provider
    url: 'http://localhost:8545',   // Url for web3
    account: '0x0',                 // current ethereum account

    init: function () {
        return App.initWeb3();
    },

    /* initialize Web3 */
    initWeb3: function () {

        if (typeof web3 != 'undefined') {
            App.web3Provider = window.ethereum;
            web3 = new Web3(App.web3Provider);
            try {
                ethereum.enable().then(async () => {
                    console.log("DApp connected to Metamask");
                });
            }
            catch (error) {
                console.log(error);
            }
        } else {
            App.web3Provider = new Web3.providers.HttpProvider(App.url);
            web3 = new Web3(App.web3Provider);
        }

        return App.initContract();
    },

    /* Upload the contract's abstractions */
    initContract: function () {

        // Get current account
        web3.eth.getCoinbase(function (err, account) {
            if (err == null) {
                App.account = account;
                $("#accountId").html("Your address: " + account);
            }
        });

        // Load content's abstractions
        $.getJSON("Mayor.json").done(function (c) {
            App.contracts["Mayor"] = TruffleContract(c);
            App.contracts["Mayor"].setProvider(App.web3Provider);

            return App.listenForEvents();
        });
    },

    /**
     * Listeners for events from the smart contract.
     */
    listenForEvents: function () {
        App.contracts["Mayor"].deployed().then(async (instance) => {

            // A new mayor is elected, shows the address of the new mayor into the message area
            instance.NewMayor( function (error, event) {
                console.log(event);
                App.show_message("Success", event.event + " event, the new mayor is " + event.args._candidate);
            });

            // There is a tie, a message is shown in the specific area
            instance.Tie( function (error, event) {
                console.log(event);
                App.show_message("Success", event.event + " event, no one wins");
            });

            // The candidate has deposit some soul, the amount of soul is shown into the message area
            instance.Deposit( function (error, event) {
                console.log(event);
                App.show_message("Success", event.event +
                    " event, you have successfully deposited " + Web3.utils.fromWei(event.args._soul, "ether") + " souls");
            });

            // A voter cast an envelope, a message is shown
            instance.EnvelopeCast( function (error, event) {
                console.log(event);
                App.show_message("Success", event.event + " event, you have successfully cast an envelope");
            });

            // An envelope has been opened, the soul and the candidate of the envelope are shown in the message area
            instance.EnvelopeOpen( function (error, event) {
                console.log(event);
                App.show_message("Success", event.event +
                    " event, you have successfully opened your envelope<br>\
                    <strong>Soul:</strong> " + Web3.utils.fromWei(event.args._soul, "ether") + "<br>\
                    <strong>Candidate:</strong> " + event.args._symbol);
            });

            return App.render();
        });
    },

    // Page render with informations from the smart contract
    render: function () {
        App.contracts["Mayor"].deployed().then(async (instance) => {

            // Retrieve the candidates and fills the select input elements
            let select_cast = document.querySelector("#cast_candidate");
            let select_open = document.querySelector("#open_candidate");
            const candidates_number = await instance.get_number_of_candidates();
            const candidates = new Array(candidates_number);
            for (let i = 0; i < candidates_number; i++) {   //retrieve the candidates
                candidates[i] = await instance.candidates_addresses(i);
            }
            candidates.forEach((obj, index) => {    //for each candidate creates an option into the two selects
                let opt_cast = document.createElement("option");
                let opt_open = document.createElement("option");
                opt_cast.value = obj;
                opt_cast.innerHTML = obj;
                opt_open.value = obj;
                opt_open.innerHTML = obj;
                select_cast.appendChild(opt_cast);
                select_open.appendChild(opt_open);
            });

            // Retrieves some smart contract's attributes for statistics
            const voting_condition = await instance.voting_condition();
            const escrow = await instance.escrow();
            const quorum = voting_condition[1];
            const envelopes_cast = voting_condition[2];
            const envelopes_open = voting_condition[3];
            const candidates_deposited = voting_condition[4];
            $('#escrow').val(escrow);
            $('#quorum').val(quorum);
            $('#envelopes_cast').val(envelopes_cast);
            $('#envelopes_opened').val(envelopes_open);
            $('#candidates_deposited').val(candidates_deposited);

        });

        // Links buttons to smart contract functions
        $('#cast_envelope_button').click(function () {
            return App.cast_envelope($('#cast_sigil').val(), $('#cast_candidate').val(), $('#cast_souls').val());
        });

        $('#open_envelope_button').click(function () {
            return App.open_envelope($('#open_sigil').val(), $('#open_candidate').val(), $('#open_souls').val());
        });

        $('#deposit_button').click(function () {
            return App.deposit($('#deposit_soul').val());
        });

        $('#mayor_or_sayonara_button').click(function () {
            return App.mayor_or_sayonara();
        });
    },

    /**
     * Calls the deposit function of the smart contract to deposit some soul from a candidate
     * @param {Int} soul    Soul to deposit
     */
    deposit: function (soul) {
        App.contracts["Mayor"].deployed().then(async (instance) => {
            await instance.deposit({ from: App.account, value: web3.utils.toWei(soul, 'ether') })
                .on('error', function (error) { // The function failed
                    const reason = App.parse_error(error.message);  // Retrieves the error reason from the promise object
                    App.show_message("Warning", reason);
                    console.log("Warning: " + reason);
                });

            //Updates the election statistics
            const voting_condition = await instance.voting_condition();
            const candidates_deposited = voting_condition[4];
            $('#candidates_deposited').val(candidates_deposited);
        });
    },

    /**
     * Calls the solidity function for casting an envelope.
     * @param {Int} sigil       Sigil of the voter 
     * @param {String} symbol   Address of the candidate 
     * @param {Int} soul        Soul to give to the candidate
     */
    cast_envelope: function (sigil, symbol, soul) {
        App.contracts["Mayor"].deployed().then(async (instance) => {
            const envelope = await instance.compute_envelope(sigil, symbol, web3.utils.toWei(soul, 'ether'));
            await instance.cast_envelope(envelope, { from: App.account })
                .on('error', function (error) { // The function failed
                    const reason = App.parse_error(error.message);  // Retrieves the failure reason
                    App.show_message("Warning", reason);
                    console.log("Warning: " + reason);
                });

            // Updates the election statistics
            const voting_condition = await instance.voting_condition();
            const envelopes_cast = voting_condition[2];
            $('#envelopes_cast').val(envelopes_cast);
            $('#computed_envelope').val(envelope);
        });
    },

    /**
     * Calls the solidity function for opening an envelope.
     * @param {Int} sigil       Sigil of the voter 
     * @param {String} symbol   Address of the candidate 
     * @param {Int} soul        Soul to give to the candidate
     */
    open_envelope: function (sigil, symbol, soul) {
        App.contracts["Mayor"].deployed().then(async (instance) => {
            await instance.open_envelope(sigil, symbol, { from: App.account, value: web3.utils.toWei(soul, 'ether') })
                .on('error', function (error) {     // The function failed
                    const reason = App.parse_error(error.message);  // Retrieves failure reason
                    App.show_message("Warning", reason);    // Shows failure reason
                    console.log("Warning: " + reason);
                });

            // Updates election statistics
            const voting_condition = await instance.voting_condition();
            const envelopes_open = voting_condition[3];
            $('#envelopes_opened').val(envelopes_open);
        });
    },

    /**
     * Calls the solidity function to decree a winner.
     */
    mayor_or_sayonara: function () {
        App.contracts["Mayor"].deployed().then(async (instance) => {
            await instance.mayor_or_sayonara({ from: App.account })
                .on('error', function (error) {     // The function failed
                    const reason = App.parse_error(error.message);  // Failure reason retrieved
                    App.show_message("Warning", reason);    // Show failure reason
                    console.log("Warning: " + reason);
                });
        });
    },

    /**
      * Parses the promise object returned by a solidity function terminated with error (reverted).
      * The promise object must be elaborated because Metamask adds some information to the original object.
      * The value.data.message field contains the reason of the function failure.
      * @param {Object} error Promise object containing error information from the smart contract
    */
    parse_error: function (error) {
        return JSON.parse(error.substring(56, error.length - 1)).value.data.message.substring(50);
    },

    /** 
     * Creates a bootstrap alert into the message_area section.
     * @param {String} type     Type of the message. Can be 'warning' or 'success'
     * @param {String} message  Message to show to the user
    */
    show_message: function (type, message) {
        const type_low_cased = type.toLowerCase();
        if (!(type_low_cased == 'warning' || type_low_cased == 'success')) return;
        $('#message_area').html(
            "<div class=\"alert alert-" + type.toLowerCase() + " alert-dismissible fade show\" role=\"alert\">\
                <strong>" + type + ": </strong> " + message + "\
                <button type=\"button\" class=\"close\" data-dismiss=\"alert\" aria-label=\"Close\">\
                    <span aria-hidden=\"true\">&times;</span>\
                </button>\
            </div>\
        ");
    }
}

// Call init whenever the window loads
$(function () {
    $(window).on('load', function () {
        App.init();
    });
});