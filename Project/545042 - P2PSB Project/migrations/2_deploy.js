/**
 * ./migrations/2_deploy.js
 * Leonardo Vona
 * 545042
 */

/**
 * Deploys the Mayor contract
 */

var Contract = artifacts.require("./Mayor.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(Contract, [accounts[0], accounts[1], accounts[2]], accounts[3], 4);
};