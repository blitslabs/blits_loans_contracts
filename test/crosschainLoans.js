const { time, shouldFail, balance } = require('openzeppelin-test-helpers')
const truffleAssert = require('truffle-assertions')
const { soliditySha3 } = require("web3-utils")
const Web3 = require('web3')
const BigNumber = require('bignumber.js')
const { sha256 } = require('@liquality-dev/crypto')
const { assert } = require('chai')
const helper = require('../utils/utils')
const { current } = require('openzeppelin-test-helpers/src/balance')
const DAI = artifacts.require('./DAI.sol')
const CrosschainLoans = artifacts.require('./CrosschainLoans.sol')
const HTTP_PROVIDER = 'http://localhost:7545'

let token, crosschainLoans, token_2
const SECONDS_IN_DAY = 86400

contract('CrosschainLoans', async () => {

    const accounts = [
        { publicKey: '0x22bB5f99F20Aa8D7b60FC610e2b23FC5d7a9787b', privateKey: '17bbbcfdcec00560e75d52e1805c05d58b7097c06223d28c482d356a31d79657' },
        { publicKey: '0x211996105611DB4F2877B8A5B4E5C7821950FEae', privateKey: '8f1267654dff6d2894088c65b64785582d5af6050d40f3ffb0bf7a131fd8071a' },
        { publicKey: '0x38924D978F0424D4305e4b6643B8D63403956492', privateKey: '5ec6964598e05519c5d296a1a5a250cefe556bdfb34fe36a5866d50bac9421ca' },
        { publicKey: '0x13F187ba6Ff51cbd507bd3873d45eB11f620bbB3', privateKey: '78325f6e999a357268bc3ca0fcafa83973a52ee4a0c2dad923350a8c6c64c343' },
        { publicKey: '0xb383a668A4163F97EaC61802b996DCAef4Bc0796', privateKey: '94cfa3bc419d0569eb25c96369e52d94991c8346952c28459bed15423443140e' },
        { publicKey: '0x4a2fD5b28AB34550F72B0560d38627D73e560d53', privateKey: '542acdba3e4cf1050baa4523cae0928e0c23d586844e8548171bc68b5cf0fc7e' },
    ]

    // accounts
    const owner = accounts[0].publicKey
    const owner_2 = accounts[4].publicKey
    const lender = accounts[1].publicKey
    const lenderAuto = accounts[2].publicKey
    const borrower = accounts[3].publicKey
    const aCoinLender = accounts[5].publicKey

    // private keys
    const lenderPrivateKey = accounts[1].privateKey
    const lenderAutoPrivateKey = accounts[2].privateKey
    const borrowerPrivateKey = accounts[3].privateKey
    const aCoinLenderPrivateKey = accounts[5].privateKey

    // Balances
    const lenderInitialBalance = '1000000000000000000000'

    // AssetType Settings  
    const minLoanAmount = '100000000000000000000'
    const maxLoanAmount = '10000000000000000000000'
    const baseRatePerYear = '55000000000000000' // 0.05
    const multiplierPerYear = '1000000000000000000' // 1.2

    // Globals
    const secondsPerYear = 31556952
    const loanExpirationPeriod = 2592000 // 30 days
    const acceptExpirationPeriod = 259200 // 3 days

    // Test timestamps
    const contract_timestamp = 1613406747

    beforeEach(async () => {

        // Deploy Token
        token = await DAI.new({ from: owner })

        // Deploy Second Token
        token_2 = await DAI.new({ from: owner })

        // Deploy Loans Contract
        crosschainLoans = await CrosschainLoans.new({ from: owner })

        // Add Asset Type
        // await loans.addAssetType(
        //     token.address,
        //     maxLoanAmount,
        //     minLoanAmount,
        //     baseRatePerYear,
        //     multiplierPerYear
        // )

        // // Transfer 1000 DAI to the Lender        
        // await token.transfer(lender, lenderInitialBalance, { from})

    })

    describe('Deployment', () => {
        it('contract should be enabled', async () => {
            const contractEnabled = await crosschainLoans.contractEnabled()
            assert.equal(contractEnabled, 1, 'Contract is not enabled')
        })

        it('owner should be authorized', async () => {
            const isAuthorized = await crosschainLoans.authorizedAccounts(owner)
            assert.equal(isAuthorized, 1, 'Owner is not authorized')
        })

        it('should emit AddAuthorization event', async () => {
            const events = await crosschainLoans.getPastEvents('AddAuthorization', {
                fromBlock: 0, toBlock: 'latest'
            })
            assert.equal(events[0].returnValues.account, owner, 'AddAuthorization event not emitted')
        })
    })

    describe('Administration', () => {
        it('should add authorization', async () => {
            await crosschainLoans.addAuthorization(owner_2)
            const owner2IsAuthorized = await crosschainLoans.authorizedAccounts(owner_2)
            const events = await crosschainLoans.getPastEvents('AddAuthorization', {
                fromBlock: 0, toBlock: 'latest'
            })
            assert.equal(owner2IsAuthorized, 1, 'Owner2 is not authorized')
            assert.equal(events[1].returnValues.account, owner_2, 'AddAuthorization event not emitted')
        })

        it('should fail to add authorization if not authorized', async () => {
            await truffleAssert.reverts(
                crosschainLoans.addAuthorization(owner_2, { from: owner_2 }),
                'CrosschainLoans/account-not-authorized',
                'User should\'t be able to authorize another account if it\'s not authorized'
            )            
        })

        it('should fail to add authorization if contract is not enabled', async () => {
            await crosschainLoans.disableContract()
            await truffleAssert.reverts(
                crosschainLoans.addAuthorization(owner_2, { from: owner }),
                'CrosschainLoans/contract-not-enabled',
                'Sender should\'t be able to authorize another account if the contract is not enabled'
            )
        })

        it('should disable contract', async () => {
            await crosschainLoans.disableContract({ from: owner })
            const contractEnabled = await crosschainLoans.contractEnabled()
            const events = await crosschainLoans.getPastEvents('DisableContract', {
                fromBlock: 0, toBlock: 'latest'
            })
            assert.equal(contractEnabled, 0, 'Contract is not disabled')
            assert.equal(events[0].event, 'DisableContract', 'DisableContract event not emitted')
        })

        it('should fail to disable contract if sender is not authorized', async () => {
            await truffleAssert.reverts(
                crosschainLoans.disableContract({ from: owner_2 }),
                'CrosschainLoans/account-not-authorized',
                'Sender should\'t be able to disable contract if not authorized'
            )
        })

        it('should enable contract', async () => {
            await crosschainLoans.disableContract({ from: owner })
            await crosschainLoans.enableContract({ from: owner })
            const contractEnabled = await crosschainLoans.contractEnabled()
            const events = await crosschainLoans.getPastEvents('EnableContract', {
                fromBlock: 0, toBlock: 'latest'
            })
            assert.equal(contractEnabled, 1, 'Contract not enabled')
            assert.equal(events[0].event, 'EnableContract', 'EnableContract event not emitted')
        })

        it('should fail to enable contract if sender is not authorized', async () => {
            await crosschainLoans.disableContract({ from: owner })
            await truffleAssert.reverts(
                crosschainLoans.enableContract({ from: owner_2 }),
                'CrosschainLoans/account-not-authorized',
                'Sender should\'t be able to enable contract if not authorized'
            )
        })
    })

    describe('AssetType', () => {
        it('should add AssetType', async () => {
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )

            await crosschainLoans.addAssetType(
                token_2.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )

            const assetType = await crosschainLoans.getAssetType(token.address)
            const events = await crosschainLoans.getPastEvents('AddAssetType', {
                fromBlock: 0, toBlock: 'latest'
            })
            const assetType_2 = await crosschainLoans.getAssetType(token_2.address)

            assert.equal(assetType.contractAddress, token.address, 'Invalid token address')
            assert.equal(assetType.maxLoanAmount, maxLoanAmount, 'Invalid maxLoanAmount')
            assert.equal(assetType.minLoanAmount, minLoanAmount, 'Invalid minLoanAmount')
            assert.equal(events[0].event, 'AddAssetType', 'AddAssetType event not emitted')

            assert.equal(assetType_2.contractAddress, token_2.address, 'Invalid token address')
            assert.equal(assetType_2.maxLoanAmount, maxLoanAmount, 'Invalid maxLoanAmount')
            assert.equal(assetType_2.minLoanAmount, minLoanAmount, 'Invalid minLoanAmount')
            assert.equal(events[1].event, 'AddAssetType', 'AddAssetType event not emitted')
        })

        it('should fail to add AssetType if contract is disabled', async () => {
            await crosschainLoans.disableContract({ from: owner })
            await truffleAssert.reverts(
                crosschainLoans.addAssetType(
                    token.address,
                    maxLoanAmount,
                    minLoanAmount,
                    baseRatePerYear,
                    multiplierPerYear
                ),
                'CrosschainLoans/contract-not-enabled',
                'Shouldn\'t be able to add AssetType if contract is disabled'
            )
        })

        it('should fail to add AssetType if sender is not authorized', async () => {
            await truffleAssert.reverts(
                crosschainLoans.addAssetType(
                    token.address,
                    maxLoanAmount,
                    minLoanAmount,
                    baseRatePerYear,
                    multiplierPerYear,
                    { from: owner_2 }
                ),
                'CrosschainLoans/account-not-authorized',
                'Shouldn\'t be able to add AssetType if contract is sender is not authorized'
            )
        })

        it('should disable AssetType', async () => {
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )
            await crosschainLoans.disableAssetType(token.address)
            const assetType = await crosschainLoans.getAssetType(token.address)
            const events = await crosschainLoans.getPastEvents('DisableAssetType', {
                fromBlock: 0, toBlock: 'latest'
            })
            assert.equal(assetType.enabled, 0, 'AssetType shouldn\'t be enabled')
            assert.equal(events[0].event, 'DisableAssetType', 'DisableAssetType event not emitted')
        })

        it('should fail to disable AssetType when sender is not authorized', async () => {
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )
            await truffleAssert.reverts(
                crosschainLoans.disableAssetType(token.address, { from: owner_2 }),
                'CrosschainLoans/account-not-authorized',
                'Shouldn\'t be able to disable AssetType if contract is sender is not authorized'
            )
        })

        it('should fail to disable AssetType when contract is disabled', async () => {
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )
            await crosschainLoans.disableContract({ from: owner })
            await truffleAssert.reverts(
                crosschainLoans.disableAssetType(token.address),
                'CrosschainLoans/contract-not-enabled',
                'Shouldn\'t be able to disable AssetType if contract is disabled'
            )
        })

        it('should enable AssetType', async () => {
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )
            await crosschainLoans.disableAssetType(token.address)
            await crosschainLoans.enableAssetType(token.address)
            const assetType = await crosschainLoans.getAssetType(token.address)
            const events = await crosschainLoans.getPastEvents('EnableAssetType', {
                fromBlock: 0, toBlock: 'latest'
            })
            assert.equal(assetType.enabled, 1, 'AssetType should be enabled')
            assert.equal(events[0].event, 'EnableAssetType')
        })

        it('should fail to enable AssetType when sender is not authorized', async () => {
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )
            await crosschainLoans.disableAssetType(token.address)
            await truffleAssert.reverts(
                crosschainLoans.enableAssetType(token.address, { from: owner_2 }),
                'CrosschainLoans/account-not-authorized',
                'Shouldn\'t be able to enable AssetType if contract is sender is not authorized'
            )
        })        
    })

    describe('AssetType Loan Parameters', () => {

        beforeEach(async () => {
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )
        })

        it('should modify AssetType Loan Parameters', async () => {           

            const web3 = new Web3()

            const newMaxLoanAmount = '5000000000000000000000'
            const newMinLoanAmount = '500000000000000000000'
            const newBaseRatePerYear = '80000000000000000' // 0.08
            const newMultiplierPerYear = '1500000000000000000' // 1.5

            await crosschainLoans.modifyAssetTypeLoanParameters(
                token.address,
                web3.utils.fromAscii('maxLoanAmount'),
                newMaxLoanAmount
            )

            await crosschainLoans.modifyAssetTypeLoanParameters(
                token.address,
                web3.utils.fromAscii('minLoanAmount'),
                newMinLoanAmount
            )

            await crosschainLoans.modifyAssetTypeLoanParameters(
                token.address,
                web3.utils.fromAscii('baseRatePerYear'),
                newBaseRatePerYear
            )

            await crosschainLoans.modifyAssetTypeLoanParameters(
                token.address,
                web3.utils.fromAscii('multiplierPerYear'),
                newMultiplierPerYear
            )

            const newBaseRatePerPeriod = BigNumber(newBaseRatePerYear).multipliedBy(loanExpirationPeriod).dividedBy(secondsPerYear)
            const newMultiplierPerPeriod = parseInt(BigNumber(newMultiplierPerYear).multipliedBy(loanExpirationPeriod).dividedBy(secondsPerYear)) / 1e18
            const assetType = await crosschainLoans.getAssetType(token.address)
            const events = await crosschainLoans.getPastEvents('ModifyAssetTypeLoanParameters', {
                fromBlock: 0, toBlock: 'latest'
            })
            assert.equal(assetType.maxLoanAmount.toString(), newMaxLoanAmount, 'Invalid maxLoanAmount')
            assert.equal(assetType.minLoanAmount.toString(), newMinLoanAmount, 'Invalid minLoanAmount')
            assert.equal(assetType.baseRatePerPeriod.toString(), parseInt(newBaseRatePerPeriod).toString(), 'Invalid baseRatePerPeriod')
            assert.equal((parseInt(assetType.multiplierPerPeriod) / 1e18).toString(), newMultiplierPerPeriod.toString(), 'Invalid multipliedPerPeriod')
            assert.equal(events[0].event, 'ModifyAssetTypeLoanParameters', 'ModifyAssetTypeLoanParameters event not emitted')
        })

        it('should fail to modify AssetType Loan Parameters if contract is disabled', async () => {
            await crosschainLoans.disableContract()
            const web3 = new Web3()
            const newMaxLoanAmount = '5000000000000000000000'
            truffleAssert.reverts(
                crosschainLoans.modifyAssetTypeLoanParameters(
                    token.address,
                    web3.utils.fromAscii('maxLoanAmount'),
                    newMaxLoanAmount
                ),
                'CrosschainLoans/contract-not-enabled',
                'Shouldn\'t be able to modify AssetType Loan Parameters if contract is disabled'
            )
        })

        it('should fail to modify AssetType Loan Parameters if sender is not authorized', async () => {
            const web3 = new Web3()
            const newMaxLoanAmount = '5000000000000000000000'
            truffleAssert.reverts(
                crosschainLoans.modifyAssetTypeLoanParameters(
                    token.address,
                    web3.utils.fromAscii('maxLoanAmount'),
                    newMaxLoanAmount
                    , { from: owner_2 }),
                'CrosschainLoans/account-not-authorized',
                'Shouldn\'t be able to modify AssetType Loan Parameters if sender is not authorized'
            )
        })

        it('should fail to modify AssetType Loan Parameters if data is invalid', async () => {
            const newMaxLoanAmount = '0'
            truffleAssert.reverts(
                crosschainLoans.modifyAssetTypeLoanParameters(
                    token.address,
                    web3.utils.fromAscii('maxLoanAmount'),
                    newMaxLoanAmount
                ),
                'CrosschainLoans/null-data',
                'Shouldn\'t be able to modify AssetType Loan Parameters if data is invalid'
            )
        })

        it('should fail to modify AssetType Loan Parameters if contract address is invalid', async () => {
            const newMaxLoanAmount = '-1'
            truffleAssert.reverts(
                crosschainLoans.modifyAssetTypeLoanParameters(
                    '0x0000000000000000000000000000000000000000',
                    web3.utils.fromAscii('maxLoanAmount'),
                    newMaxLoanAmount
                ),
                'CrosschainLoans/invalid-assetType',
                'Shouldn\'t be able to modify AssetType Loan Parameters if address is invalid'
            )
        })

        it('should fail to modify AssetType Loan Parameters if parameter is invalid', async () => {
            truffleAssert.reverts(
                crosschainLoans.modifyAssetTypeLoanParameters(
                    token.address,
                    web3.utils.fromAscii('invalidParam'),
                    '1000'
                ),
                'CrosschainLoans/modify-unrecognized-param',
                'Shouldn\'t be able to modify AssetType Loan Parameters if parameter is invalid'
            )
        })
    })

    describe('Loan Parameters', () => {
        it('should modifyLoanParameters', async () => {
            const web3 = new Web3()
            const param1 = 'loanExpirationPeriod'
            const data1 = '1000'
            const param2 = 'acceptExpirationPeriod'
            const data2 = '1000'

            await crosschainLoans.modifyLoanParameters(
                web3.utils.fromAscii(param1),
                data1
            )

            await crosschainLoans.modifyLoanParameters(
                web3.utils.fromAscii(param2),
                data2
            )
            const events = await crosschainLoans.getPastEvents('ModifyLoanParameters', {
                fromBlock: 0, toBlock: 'latest'
            })

            const loanExpirationPeriod = await crosschainLoans.loanExpirationPeriod()
            const acceptExpirationPeriod = await crosschainLoans.acceptExpirationPeriod()
            assert.equal(loanExpirationPeriod, data1, 'Invalid loanExpirationPeriod')
            assert.equal(acceptExpirationPeriod, data2, 'Invalid acceptExpirationPeriod')
            assert.equal(events[0].event, 'ModifyLoanParameters', 'ModifyLoanParameters event not emitted')
        })

        it('should fail to modifyLoanParameters if contract is disabled', async () => {
            await crosschainLoans.disableContract()
            const param1 = 'loanExpirationPeriod'
            const data1 = '1000'
            await truffleAssert.reverts(
                crosschainLoans.modifyLoanParameters(
                    web3.utils.fromAscii(param1),
                    data1
                ),
                'CrosschainLoans/contract-not-enabled',
                'Shouldn\'t be able to modifyLoanParameters if contract is disabled'
            )
        })

        it('should fail to modifyLoanParameters if sender is not authorized', async () => {
            const param1 = 'loanExpirationPeriod'
            const data1 = '1000'
            await truffleAssert.reverts(
                crosschainLoans.modifyLoanParameters(
                    web3.utils.fromAscii(param1),
                    data1,
                    { from: owner_2 }
                ),
                'CrosschainLoans/account-not-authorized',
                'Shouldn\'t be able to modifyLoanParameters if sender is not authorized'
            )
        })

        it('should fail to modifyLoanParameters if data and parameter are invalid', async () => {
            const param1 = 'loanExpirationPeriod'
            const data1 = '1000'
            await truffleAssert.reverts(
                crosschainLoans.modifyLoanParameters(
                    web3.utils.fromAscii('invalidParam'),
                    data1,
                ),
                'CrosschainLoans/modify-unrecognized-param',
                'Shouldn\'t be able to modifyLoanParameters if parameter is invalid'
            )
            await truffleAssert.reverts(
                crosschainLoans.modifyLoanParameters(
                    web3.utils.fromAscii(param1),
                    '0',
                ),
                'CrosschainLoans/null-data',
                'Shouldn\'t be able to modifyLoanParameters if data is invalid'
            )
        })
    })

    describe('Loan Creation', () => {

        const emptyAddress = '0x0000000000000000000000000000000000000000'
        const emptyBytes = '0x0000000000000000000000000000000000000000000000000000000000000000'

        beforeEach(async () => {
            // Add AssetType
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )
        })

        it('should create 2 loans', async () => {
            const web3 = new Web3()

            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            let secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            assert.equal(lenderLoansCount, '0', 'Invalid lender loansCount')

            // Loan #1 Details
            let principal = '1000000000000000000000'// 1,000

            const lenderInitialBalance = '10000000000000000000000' // 10,000

            // Transfer amount to lender
            await token.transfer(lender, lenderInitialBalance, { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: lender })

            // Create First Loan
            await crosschainLoans.createLoan(
                lenderAuto,
                secretHashB1,
                secretHashAutoB1,
                principal,
                token.address,
                aCoinLender,
                { from: lender }
            )

            // Calculate Interest
            let interestRate = await crosschainLoans.getAssetInterestRate(token.address)
            let firstLoanInterest = parseInt(BigNumber(principal).multipliedBy(interestRate.toString()).dividedBy(1e18))

            // Fetch Loan#1
            const firstLoan = await crosschainLoans.fetchLoan(1)

            assert.equal(firstLoan.actors[0], emptyAddress, 'Invalid borrower')
            assert.equal(firstLoan.actors[1], lender, 'Invalid lender')
            assert.equal(firstLoan.actors[2], lenderAuto, 'Invalid lenderAuto')
            assert.equal(firstLoan.secretHashes[0], emptyBytes, 'Invalid secretHashA1')
            assert.equal(firstLoan.secretHashes[1], secretHashB1, 'Invalid secretHashB1')
            assert.equal(firstLoan.secretHashes[2], secretHashAutoB1, 'Invalid secretHashAutoB1')
            assert.equal(firstLoan.secrets[0], emptyBytes, 'Invalid secretA1')
            assert.equal(firstLoan.secrets[1], emptyBytes, 'Invalid secretB1')
            assert.equal(firstLoan.secrets[2], emptyBytes, 'Invalid secretAutoB1')
            assert.equal(firstLoan.expirations[0].toString(), '0', 'Invalid Loan Expiration')
            assert.equal(firstLoan.expirations[1].toString(), '0', 'Invalid Accept Expiration')
            assert.equal(firstLoan.details[0], principal, 'Invalid principal')
            assert.equal(firstLoan.details[1], firstLoanInterest, 'Invalid loan interest')
            assert.equal(firstLoan.aCoinLenderAddress, aCoinLender, 'Invalid aCoinLenderAddress')
            assert.equal(firstLoan.state.toString(), '1', 'Invalid Loan State')

            let lenderNewBalance = await token.balanceOf(lender)
            let balanceCheck = (parseFloat(lenderNewBalance.toString()) + parseInt(principal))
            assert.equal(lenderInitialBalance, balanceCheck, 'Invalid Balance')

            // Create Second Loan
            // Lender secret / secretHash
            lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            assert.equal(lenderLoansCount, '1', 'Invalid lender loansCount')

            await crosschainLoans.createLoan(
                lenderAuto,
                secretHashB1,
                secretHashAutoB1,
                principal,
                token.address,
                aCoinLender,
                { from: lender }
            )

            const secondLoan = await crosschainLoans.fetchLoan(2)
            lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            assert.equal(lenderLoansCount, '2', 'Invalid lender loansCount')
            assert.equal(secondLoan.secretHashes[0], emptyBytes, 'Invalid secretHashA1')
            assert.equal(secondLoan.secretHashes[1], secretHashB1, 'Invalid secretHashB1')
            assert.equal(secondLoan.secretHashes[2], secretHashAutoB1, 'Invalid secretHashAutoB1')
            lenderNewBalance = await token.balanceOf(lender)
            assert.equal(lenderNewBalance.toString(), '8000000000000000000000', 'Invalid Balance')

            // User Loans
            const userLoans = await crosschainLoans.getAccountLoans(lender)
            assert.equal(userLoans[0].toString(), '1', 'Invalid loan Id (#1)')
            assert.equal(userLoans[1].toString(), '2', 'Invalid loan Id (#2)')
        })

        it('should fail to create loan if principal is out of range', async () => {
            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            let secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            // Loan Details
            let principal = '0'

            // Transfer amount to lender
            await token.transfer(lender, '100', { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: lender })

            truffleAssert.reverts(
                crosschainLoans.createLoan(
                    lenderAuto,
                    secretHashB1,
                    secretHashAutoB1,
                    principal,
                    token.address,
                    aCoinLender,
                    { from: lender }
                ),
                "CrosschainLoans/invalid-principal-amount",
                "Loan shouldn\'t be created if amount is invalid"
            )

            truffleAssert.reverts(
                crosschainLoans.createLoan(
                    lenderAuto,
                    secretHashB1,
                    secretHashAutoB1,
                    '10000000000000000000001',
                    token.address,
                    aCoinLender,
                    { from: lender }
                ),
                "CrosschainLoans/invalid-principal-range",
                "Loan shouldn\'t be created if amount is invalid"
            )

            truffleAssert.reverts(
                crosschainLoans.createLoan(
                    lenderAuto,
                    secretHashB1,
                    secretHashAutoB1,
                    '1',
                    token.address,
                    aCoinLender,
                    { from: lender }
                ),
                "CrosschainLoans/invalid-principal-range",
                "Loan shouldn\'t be created if amount is invalid"
            )
        })

        it('should fail to create loan if AssetType is disabled or invalid', async () => {
            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            let secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            // Loan Details
            let principal = '100'

            // Transfer amount to lender
            await token.transfer(lender, '100', { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: lender })

            // Disable AssetType    
            await crosschainLoans.disableAssetType(token.address)

            truffleAssert.reverts(
                crosschainLoans.createLoan(
                    lenderAuto,
                    secretHashB1,
                    secretHashAutoB1,
                    principal,
                    token.address,
                    aCoinLender,
                    { from: lender }
                ),
                "CrosschainLoans/asset-type-disabled",
                "Loan shouldn\'t be created if AssetType is disabled"
            )

            truffleAssert.reverts(
                crosschainLoans.createLoan(
                    lenderAuto,
                    secretHashB1,
                    secretHashAutoB1,
                    principal,
                    emptyAddress,
                    aCoinLender,
                    { from: lender }
                ),
                "CrosschainLoans/asset-type-disabled",
                "Loan shouldn\'t be created if AssetType is disabled"
            )
        })

        it('should fail to create loan if allowance is insufficient', async () => {
            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            let secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            // Loan Details
            let principal = '1000000000000000000000'

            // Transfer amount to lender
            await token.transfer(lender, '100', { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, '1', { from: lender })           

            truffleAssert.reverts(
                crosschainLoans.createLoan(
                    lenderAuto,
                    secretHashB1,
                    secretHashAutoB1,
                    principal,
                    token.address,
                    aCoinLender,
                    { from: lender }
                ),
                "CrosschainLoans/insufficient-token-allowance",
                "Loan shouldn\'t be created if Allowance is insufficient"
            )            
        })

        it('should fail to create loan if token balance is insufficient', async () => {
            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            let secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            // Loan Details
            let principal = '1000000000000000000000'

            // Transfer amount to lender
            // await token.transfer(lender, principal, { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, principal, { from: lender })           

            truffleAssert.reverts(
                crosschainLoans.createLoan(
                    lenderAuto,
                    secretHashB1,
                    secretHashAutoB1,
                    principal,
                    token.address,
                    aCoinLender,
                    { from: lender }
                ),
                "ERC20: transfer amount exceeds balance",
                "Loan shouldn\'t be created if transfer amount exceeds balance"
            )            
        })
    })

    describe('Assign Borrower And Approve', async () => {

        let snapshot, snapshotId, borrowerLoansCount, secretA1, secretHashA1
        const web3 = new Web3(HTTP_PROVIDER)

        beforeEach(async () => {

            snapshot = await helper.takeSnapshot()
            snapshotId = snapshot['result']
            const web3 = new Web3()

            // Add AssetType
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )

            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            let secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            assert.equal(lenderLoansCount, '0', 'Invalid lender loansCount')

            // Loan #1 Details
            let principal = '1000000000000000000000'// 1,000

            const lenderInitialBalance = '10000000000000000000000' // 10,000

            // Transfer amount to lender
            await token.transfer(lender, lenderInitialBalance, { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: lender })

            // Create First Loan
            await crosschainLoans.createLoan(
                lenderAuto,
                secretHashB1,
                secretHashAutoB1,
                principal,
                token.address,
                aCoinLender,
                { from: lender }
            )

            // Lender secret / secretHash
            borrowerLoansCount = await crosschainLoans.userLoansCount(borrower)
            secretA1 = sha256(web3.eth.accounts.sign(`SecretA1. Nonce: ${borrowerLoansCount}`, borrowerPrivateKey))
            secretHashA1 = `0x${sha256(secretA1)}`
        })

        afterEach(async () => {
            await helper.revertToSnapShot(snapshotId)
        })

        it('should approve loan', async () => {

            const tx = await crosschainLoans.setBorrowerAndApprove(
                '1',
                borrower,
                secretHashA1,
                { from: lender }
            )

            const currentTimestamp = (await web3.eth.getBlock(tx.receipt.blockNumber))['timestamp']
            const loan = await crosschainLoans.fetchLoan(1)

            const events = await crosschainLoans.getPastEvents('LoanAssignedAndApproved', {
                fromBlock: 0, toBlock: 'latest'
            })

            assert.equal(loan.state, 2, 'Invalid Loan State')
            assert.equal(loan.actors[0], borrower, 'Invalid borrower')
            assert.equal(loan.secretHashes[0], secretHashA1, 'Invalid secretHashA1')
            assert.equal(loan.expirations[0].toString(), parseInt(currentTimestamp) + loanExpirationPeriod, 'Invalid Loan Expiration')
            assert.equal(loan.expirations[1].toString(), parseInt(currentTimestamp) + loanExpirationPeriod + acceptExpirationPeriod, 'Invalid Loan Approve Expiration')
            assert.equal(events[0].event, 'LoanAssignedAndApproved', 'LoanAssignedAndApproved event not emitted')
        })

        it('should fail to approve loan if state is invalid', async () => {
            await crosschainLoans.setBorrowerAndApprove(
                '1',
                borrower,
                secretHashA1,
                { from: lender }
            )

            await truffleAssert.reverts(
                crosschainLoans.setBorrowerAndApprove(
                    '1',
                    borrower,
                    secretHashA1,
                    { from: lender }
                ),
                "CrosschainLoans/loan-not-funded",
                "Loan shouldn\'t be approved if state is not Funded"
            )
        })

        it('should fail if sender is not lender or lenderAuto', async () => {
            await truffleAssert.reverts(
                crosschainLoans.setBorrowerAndApprove(
                    '1',
                    borrower,
                    secretHashA1,
                    { from: owner }
                ),
                "CrosschainLoans/account-not-authorized",
                "Loan shouldn\'t be approved if state is not Funded"
            )

            await crosschainLoans.setBorrowerAndApprove(
                '1',
                borrower,
                secretHashA1,
                { from: lenderAuto }
            )

            const loan = await crosschainLoans.fetchLoan(1)
            assert.equal(loan.state.toString(), '2', 'Invalid Loan State')
        })
    })

    describe('Withdraw Principal', async () => {
        let snapshot, snapshotId, borrowerLoansCount, secretA1, secretHashA1, principal, secretB1
        const web3 = new Web3(HTTP_PROVIDER)

        beforeEach(async () => {

            snapshot = await helper.takeSnapshot()
            snapshotId = snapshot['result']
            const web3 = new Web3()

            // Add AssetType
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )

            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            // Borrower secret / secretHash
            borrowerLoansCount = await crosschainLoans.userLoansCount(borrower)
            secretA1 = sha256(web3.eth.accounts.sign(`SecretA1. Nonce: ${borrowerLoansCount}`, borrowerPrivateKey))
            secretHashA1 = `0x${sha256(secretA1)}`

            assert.equal(lenderLoansCount, '0', 'Invalid lender loansCount')

            // Loan #1 Details
            principal = '1000000000000000000000'// 1,000

            const lenderInitialBalance = '10000000000000000000000' // 10,000

            // Transfer amount to lender
            await token.transfer(lender, lenderInitialBalance, { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: lender })

            // Create First Loan
            await crosschainLoans.createLoan(
                lenderAuto,
                secretHashB1,
                secretHashAutoB1,
                principal,
                token.address,
                aCoinLender,
                { from: lender }
            )

            await crosschainLoans.setBorrowerAndApprove(
                '1',
                borrower,
                secretHashA1,
                { from: lender }
            )
        })

        afterEach(async () => {
            await helper.revertToSnapShot(snapshotId)
        })

        it('should withdraw loan principal', async () => {
            await crosschainLoans.withdraw(
                '1',
                `0x${secretA1}`
            )
            const loan = await crosschainLoans.fetchLoan(1)
            const borrower_balance = await token.balanceOf(borrower)
            const events = await crosschainLoans.getPastEvents('LoanPrincipalWithdrawn', {
                fromBlock: 0, toBlock: 'latest'
            })
            assert.equal(loan.state, '3', 'Invalid loan state')
            assert.equal(borrower_balance, principal, 'Invalid borrower balance')
            assert.equal(events[0].event, 'LoanPrincipalWithdrawn', 'LoanPrincipalWithdrawn event not emitted')
        })

        it('should fail to withdraw if loan state is invalid', async () => {
            await crosschainLoans.withdraw(
                '1',
                `0x${secretA1}`
            )
            await truffleAssert.reverts(
                crosschainLoans.withdraw('1',`0x${secretA1}`),
                "CrosschainLoans/loan-not-approved",
                "Loan principal shouldn't be withdrawn if the loan's state is invalid"
            )
        })

        it('should fail to withdraw if loan expired', async () => {
            await helper.advanceTimeAndBlock(SECONDS_IN_DAY * 31)            
            await truffleAssert.reverts(
                crosschainLoans.withdraw('1', `0x${secretA1}`),
                "CrosschainLoans/loan-expired",
                "Loan principal shouldn\'t be withdrawn if loan expired"
            )
        })

        it('should fail to withdraw if secretA1 is invalid', async () => {
            await truffleAssert.reverts(
                crosschainLoans.withdraw('1', `0x${secretB1}`),
                'CrosschainLoans/invalid-secret-A1',
                'Loan principal shouldn\'t be withdrawn if secretA1 is invalid'
            )
        })
    })

    describe('Cancel Loan', () => {
        let snapshot, snapshotId, borrowerLoansCount, secretA1, secretHashA1, principal, secretB1
        const web3 = new Web3(HTTP_PROVIDER)

        beforeEach(async () => {

            snapshot = await helper.takeSnapshot()
            snapshotId = snapshot['result']
            const web3 = new Web3()

            // Add AssetType
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )

            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            // Borrower secret / secretHash
            borrowerLoansCount = await crosschainLoans.userLoansCount(borrower)
            secretA1 = sha256(web3.eth.accounts.sign(`SecretA1. Nonce: ${borrowerLoansCount}`, borrowerPrivateKey))
            secretHashA1 = `0x${sha256(secretA1)}`

            assert.equal(lenderLoansCount, '0', 'Invalid lender loansCount')

            // Loan #1 Details
            principal = '1000000000000000000000'// 1,000

            const lenderInitialBalance = '10000000000000000000000' // 10,000

            // Transfer amount to lender
            await token.transfer(lender, lenderInitialBalance, { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: lender })

            // Create First Loan
            await crosschainLoans.createLoan(
                lenderAuto,
                secretHashB1,
                secretHashAutoB1,
                principal,
                token.address,
                aCoinLender,
                { from: lender }
            )

            await crosschainLoans.setBorrowerAndApprove(
                '1',
                borrower,
                secretHashA1,
                { from: lender }
            )
        })

        afterEach(async () => {
            await helper.revertToSnapShot(snapshotId)
        })

        it('should cancel loan', async () => {
            const initialLenderBalance = await token.balanceOf(lender)

            await crosschainLoans.cancelLoanBeforePrincipalWithdraw(
                '1',
                `0x${secretB1}`
            )
            const finalLenderBalance = await token.balanceOf(lender)

            const loan = await crosschainLoans.fetchLoan(1)
            const events = await crosschainLoans.getPastEvents('CancelLoan', {
                fromBlock: 0, toBlock: 'latest'
            })

            assert.equal(loan.state, '7', 'Invalid canceled loan state')
            assert.equal(events[0].event, 'CancelLoan', 'CancelLoan event not emitted')
            assert.equal(finalLenderBalance.toString(), '10000000000000000000000', 'Invalid refund amount')
            assert.equal(loan.details[0], '0', 'Invalid zero balance')
        })

        it('should fail to cancel loan if secretB1 is invalid', async () => {
            await truffleAssert.reverts(
                crosschainLoans.cancelLoanBeforePrincipalWithdraw(
                    '1',
                    `0x${secretA1}`
                ),
                "CrosschainLoans/invalid-secret-B1",
                "Loan shouldn't be canceled if secretB1 is invalid"
            )
        })

        it('should fail to cancel loan if principal has been withdrawn', async () => {
            await crosschainLoans.withdraw(
                '1',
                `0x${secretA1}`
            )
            await truffleAssert.reverts(
                crosschainLoans.cancelLoanBeforePrincipalWithdraw(
                    '1',
                    `0x${secretB1}`
                ),
                "CrosschainLoans/principal-withdrawn",
                "Loan shouldn't be canceled if principal has been withdrawn"
            )
        })
    })

    describe('Payback', () => {

        let snapshot, snapshotId, borrowerLoansCount, secretA1, secretHashA1, principal, secretB1
        const web3 = new Web3(HTTP_PROVIDER)

        beforeEach(async () => {

            snapshot = await helper.takeSnapshot()
            snapshotId = snapshot['result']
            const web3 = new Web3()

            // Add AssetType
            await crosschainLoans.addAssetType(
                token.address,
                maxLoanAmount,
                minLoanAmount,
                baseRatePerYear,
                multiplierPerYear
            )

            // Lender secret / secretHash
            let lenderLoansCount = await crosschainLoans.userLoansCount(lender)
            secretB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderLoansCount}`, lenderPrivateKey))
            let secretHashB1 = `0x${sha256(secretB1)}`

            // AutoLender secret / secretHash
            let lenderAutoLoansCount = await crosschainLoans.userLoansCount(lenderAuto)
            let secretAutoB1 = sha256(web3.eth.accounts.sign(`SecretB1. Nonce: ${lenderAutoLoansCount}`, lenderAutoPrivateKey))
            let secretHashAutoB1 = `0x${sha256(secretAutoB1)}`

            // Borrower secret / secretHash
            borrowerLoansCount = await crosschainLoans.userLoansCount(borrower)
            secretA1 = sha256(web3.eth.accounts.sign(`SecretA1. Nonce: ${borrowerLoansCount}`, borrowerPrivateKey))
            secretHashA1 = `0x${sha256(secretA1)}`

            assert.equal(lenderLoansCount, '0', 'Invalid lender loansCount')

            // Loan #1 Details
            principal = '1000000000000000000000'// 1,000

            const lenderInitialBalance = '10000000000000000000000' // 10,000

            // Transfer amount to lender
            await token.transfer(lender, lenderInitialBalance, { from: owner })

            // Approve Allowance (Lender)
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: lender })

            // Create First Loan
            await crosschainLoans.createLoan(
                lenderAuto,
                secretHashB1,
                secretHashAutoB1,
                principal,
                token.address,
                aCoinLender,
                { from: lender }
            )

            await crosschainLoans.setBorrowerAndApprove(
                '1',
                borrower,
                secretHashA1,
                { from: lender }
            )

            await crosschainLoans.withdraw(
                '1',
                `0x${secretA1}`
            )
        })

        afterEach(async () => {
            await helper.revertToSnapShot(snapshotId)
        })

        it('should repay loan', async () => {
            let loan = await crosschainLoans.fetchLoan(1)
            const interest = loan.details[1]
            await token.transfer(borrower, interest, { from: owner })
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: borrower })

            await crosschainLoans.payback('1', { from: borrower })
            const borrowerBalance = await token.balanceOf(borrower)
            const events = await crosschainLoans.getPastEvents('Payback', {
                fromBlock: 0, toBlock: 'latest'
            })
            loan = await crosschainLoans.fetchLoan(1)

            assert.equal(borrowerBalance, '0', 'Invalid borrower balance after repayment')
            assert.equal(loan.state, '4', 'Invalid loan state')
            assert.equal(events[0].event, 'Payback', 'Payback event not emitted')
        })

        it('should fail to repay loan if loan\'s state is not Withdrawn', async () => {
            let loan = await crosschainLoans.fetchLoan(1)
            const interest = loan.details[1]
            await token.transfer(borrower, interest, { from: owner })
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: borrower })
            await crosschainLoans.payback('1', { from: borrower })
            await truffleAssert.reverts(
                crosschainLoans.payback('1', { from: borrower }),
                "CrosschainLoans/invalid-loan-state",
                "Loan shouldn't be repaid if state is not Withdrawn"
            )
        })

        it('should fail to repay loan if it\'s expired', async () => {
            await helper.advanceTimeAndBlock(SECONDS_IN_DAY * 31) 
            let loan = await crosschainLoans.fetchLoan(1)
            const interest = loan.details[1]
            await token.transfer(borrower, interest, { from: owner })
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: borrower })
            await truffleAssert.reverts(
                crosschainLoans.payback('1', { from: borrower }),
                "CrosschainLoans/loan-expired",
                "Loan shouldn't be repaid if loan expired"
            )
        })

        it('should fail to repay loan if allowance is insufficient', async () => {
            let loan = await crosschainLoans.fetchLoan(1)
            const interest = loan.details[1]
            await token.transfer(borrower, interest, { from: owner })
            await token.approve(crosschainLoans.address, '1', { from: borrower })
            await truffleAssert.reverts(
                crosschainLoans.payback('1', { from: borrower }),
                "CrosschainLoans/insufficient-token-allowance",
                "Loan shouldn't be repaid if insufficient allowance"
            )
        })

        it('should fail to repay loan if insufficient balance', async () => {
            let loan = await crosschainLoans.fetchLoan(1)
            const interest = loan.details[1]
            await token.approve(crosschainLoans.address, '1000000000000000000000000', { from: borrower })
            await truffleAssert.reverts(
                crosschainLoans.payback('1', { from: borrower }),
                "ERC20: transfer amount exceeds balance",
                "Loan shouldn't be repaid if insufficient balance"
            )
        })
    })
})