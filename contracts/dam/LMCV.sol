// SPDX-License-Identifier: AGPL-3.0-or-later

/// LMCV.sol -- dPrime CDP database

// - `wad`: fixed point decimal with 18 decimals (for basic quantities, e.g. balances)
// - `ray`: fixed point decimal with 27 decimals (for precise quantites, e.g. ratios)
// - `rad`: fixed point decimal with 45 decimals (result of integer multiplication with a `wad` and a `ray`)

pragma solidity 0.8.7;

import "hardhat/console.sol";

contract LMCV {
    mapping (address => uint256) public admins;
    mapping (address => bool)    public PSMAddresses;
    mapping (address => mapping (address => uint256))    public proxyApprovals;

    struct CollateralType {
        uint256 spotPrice;          // [ray] - ratio of dPrime per unit of collateral
        uint256 totalDebt;          // [wad] - units of Collateral
        uint256 debtCeiling;        // [wad] - Protocol Level
        uint256 debtFloor;          // [wad] - Account level
        uint256 debtMult;           // [ray] - ie. max 70% loaned out as dPrime
        uint256 liqBonusMult;       // [ray] - ie. 5% for bluechip, 15% for junk
        bool    leveraged;
    }

    bytes32[] public CollateralList;
    mapping (bytes32 => CollateralType)                 public CollateralTypes;

    //CDP
    mapping (address => bytes32[])                      public lockedCollateralList;
    mapping (address => mapping (bytes32 => uint256))   public lockedCollateral;    // [wad]
    mapping (address => mapping (bytes32 => uint256))   public unlockedCollateral;  // [wad]

    mapping (address => uint256)                        public normalDebt;          // [wad] - normalized
    mapping (address => uint256)                        public dPrime;              // [rad] - withdrawable
    
    //Admin
    uint256 public loanLive;
    uint256 public totalNormalizedDebt; // [wad] //TODO: Test
    uint256 public totalPSMDebt;        // [wad]
    uint256 public dPrimeTotalDebt;     // [rad]
    uint256 public ProtocolDebtCeiling; // [rad]
    uint256 public MintFee;             // [ray]
    uint256 public StabilityRate;       // [ray]
    address public Treasury;

    //Liquidation
    mapping (address => uint256) public liquidationDebt;    // [rad]
    uint256 public totalLiquidationDebt;                    // [rad]
    uint256 public liquidationMult;                         // [ray] ie. user at 80% dPrime/collateral ratio -> liquidate


    // --- Events ---
    event EditAcceptedCollateralType(bytes32 indexed collateralName, uint256 debtCeiling, uint256 debtFloor, uint256 debtMult, uint256 liqBonusMult, bool leveraged);
    event Liquidation(address indexed liquidated, address indexed liquidator, uint256 normalDebtChange, bytes32[] collats, uint256[] collateralChange);
    event LoanRepayment(uint256 indexed dPrimeChange, address indexed user, bytes32[] collats, uint256[] amounts);
    event CreateLiquidationDebt(address indexed debtReceiver, address indexed dPrimeReceiver, uint256 rad);
    event Loan(uint256 indexed dPrimeChange, address indexed user, bytes32[] collats, uint256[] amounts);
    event MoveCollateral(bytes32 indexed collat, address indexed src, address indexed dst, uint256 wad);
    event PushCollateral(bytes32 indexed collat, address indexed src, uint256 wad);
    event PullCollateral(bytes32 indexed collat, address indexed src, uint256 wad);
    event MoveDPrime(address indexed src, address indexed dst, uint256 frad);
    event MovePortfolio(address indexed src, address indexed dst);
    event PushLiquidationDPrime(address indexed src, uint256 rad);
    event PullLiquidationDPrime(address indexed src, uint256 rad);
    event SpotUpdate(bytes32 indexed collateral, uint256 spot);
    event RepayLiquidationDebt(address indexed u, uint256 rad);
    event AddLoanedDPrime(address indexed user, uint256 rad);
    event EnterDPrime(address indexed src, uint256 rad);
    event ExitDPrime(address indexed src, uint256 rad);
    event UpdateRate(int256 rate);
    

    modifier auth() {
        require(admins[msg.sender] == 1, "LMCV/Not Authorized");
        _;
    }

    modifier loanAlive() {
        require(loanLive == 1, "LMCV/Loan paused");
        _;
    }

    constructor() {
        StabilityRate = RAY;
        loanLive = 1;
        admins[msg.sender] = 1;
        Treasury = msg.sender;
    }

    function administrate(address admin, uint256 authorization) external auth {
        admins[admin] = authorization;
    }

    // --- Allowance ---
    function proxyApprove(address[] memory users) external {
        for(uint256 i = 0; i < users.length; i++){
            proxyApprovals[msg.sender][users[i]] = 1;
        }
    }

    function proxyDisapprove(address user) external {
        proxyApprovals[msg.sender][user] = 0;
    }

    function approval(address bit, address user) internal view returns (bool) {
        return either(bit == user, proxyApprovals[bit][user] == 1);
    }

    // --- Math ---
    uint256 constant RAY = 10 ** 27;
    // Can only be used sensibly with the following combination of units:
    // - `rmul(wad, ray) -> wad`
    // - `rmul(ray, ray) -> ray`
    // - `rmul(rad, ray) -> rad`
    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y;
        require(y == 0 || z / y == x);
        z = z / RAY;
    }

    function _add(uint256 x, int256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x + uint256(y);
        }
        require(y >= 0 || z <= x);
        require(y <= 0 || z >= x);
    }

    function _int256(uint256 x) internal pure returns (int256 y) {
        require((y = int256(x)) >= 0);
    }

    // --- Protocol Admin ---
    function setLoanAlive(uint256 flag) external auth {
        loanLive = flag;
    }

    function setProtocolDebtCeiling(uint256 rad) external auth {
        ProtocolDebtCeiling = rad;
    }

    function setMintFee(uint256 ray) external auth {
        MintFee = ray;
    }

    function setTreasury(address _treasury) external auth {
        require(_treasury != address(0x0), "LMCV/Can't be zero address");
        Treasury = _treasury;
    }

    function setPSMAddress(address psm, bool status) external auth {
        require(psm != address(0x0), "LMCV/Can't be zero address");
        PSMAddresses[psm] = status;
    }
    
    // --- Liquidation Admin ---
    function setLiquidationMult(uint256 ray) external auth {
        liquidationMult = ray;
    }

    // --- Collateral Admin ---
    function collatDebtCeiling(bytes32 collateral, uint256 wad) external auth {
        CollateralTypes[collateral].debtCeiling = wad;
    }

    function collatDebtFloor(bytes32 collateral, uint256 wad) external auth {
        CollateralTypes[collateral].debtFloor = wad;
    }

    function collatDebtMult(bytes32 collateral, uint256 ray) external auth {
        require(CollateralTypes[collateral].debtMult <= liquidationMult, "LMCV/Debt multiplier must be lower than liquidation multiplier");
        CollateralTypes[collateral].debtMult = ray;
    }

    function collatLiqBonusMult(bytes32 collateral, uint256 ray) external auth {
        CollateralTypes[collateral].liqBonusMult = ray;
    }

    function collatLeveraged(bytes32 collateral, bool _leveraged) external auth {
        CollateralTypes[collateral].leveraged = _leveraged;
    }

    function updateSpotPrice(bytes32 collateral, uint256 ray) external auth {
        CollateralTypes[collateral].spotPrice = ray;
        emit SpotUpdate(collateral, ray);
    }

    function editCollateralList(bytes32 collateralName, bool accepted, uint256 position) external auth {
        if(accepted){
            CollateralList.push(collateralName);
        }else{
            deleteElement(CollateralList, position);
        }
    }

    function editAcceptedCollateralType(
        bytes32 collateralName,
        uint256 _debtCeiling,       // [wad] - Protocol Level
        uint256 _debtFloor,         // [wad] - Account level
        uint256 _debtMult,          // [ray] - ie. max 70% loaned out as dPrime
        uint256 _liqBonusMult,      // [ray] - ie. 5% for bluechip, 15% for junk
        bool    _leveraged
    ) external auth {
        CollateralType memory collateralType = CollateralTypes[collateralName];
        collateralType.debtCeiling = _debtCeiling;
        collateralType.debtFloor = _debtFloor;
        collateralType.debtMult = _debtMult;
        collateralType.liqBonusMult = _liqBonusMult;
        collateralType.leveraged = _leveraged;

        CollateralTypes[collateralName] = collateralType;
        emit EditAcceptedCollateralType(collateralName, _debtCeiling, _debtFloor, _debtMult, _liqBonusMult, _leveraged);
    }

    // --- Fungibility ---
    function pushCollateral(bytes32 collat, address user, uint256 wad) external auth {
        unlockedCollateral[user][collat] += wad;
        emit PushCollateral(collat, user, wad);
    }

    function pullCollateral(bytes32 collat, address user, uint256 wad) external auth {
        unlockedCollateral[user][collat] -= wad;
        emit PullCollateral(collat, user, wad);
    }

    function moveCollateral(bytes32 collat, address src, address dst, uint256 wad) external {
        require(approval(src, msg.sender), "LMCV/not allowed");
        unlockedCollateral[src][collat] -= wad;
        unlockedCollateral[dst][collat] += wad;
        emit MoveCollateral(collat, src, dst, wad);
    }

    function moveDPrime(address src, address dst, uint256 frad) external {
        require(approval(src, msg.sender), "LMCV/not allowed");
        dPrime[src] -= frad;
        dPrime[dst] += frad;
        emit MoveDPrime(src, dst, frad);
    }

    //All collaterals linked together to be more portfolio centric
    //eg: measure of whether a vault is safe or not is done based on
    //the vault as a whole being overcollateralized properly
    function loan(
        bytes32[] memory collats,        
        uint256[] memory collateralChange,  // [wad]
        uint256 normalDebtChange,           // [wad] normalized
        address user
    ) external loanAlive {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        //Locks up all collateral
        for(uint256 i = 0; i < collats.length; i++){
            CollateralType memory collateralType = CollateralTypes[collats[i]];
            require(collateralType.debtCeiling > 0 && collateralType.debtMult > 0, "LMCV/collateral type not initialized");

            //if collateral is newly introduced to cdp
            //add it to the locked collateral list
            if(lockedCollateral[user][collats[i]] == 0){
                lockedCollateralList[user].push(collats[i]);
            }

            uint256 newLockedCollat = lockedCollateral[user][collats[i]];
            uint256 newUnlockedCollat = unlockedCollateral[user][collats[i]];

            //Change from unlocked collateral to locked collateral
            newUnlockedCollat -= collateralChange[i];
            newLockedCollat += collateralChange[i];

            require(newLockedCollat > collateralType.debtFloor, "LMCV/Collateral must be higher than dust level");

            collateralType.totalDebt += collateralChange[i];
            require(collateralType.debtCeiling > collateralType.totalDebt, "LMCV/Collateral debt ceiling exceeded");

            //Set new collateral numbers
            CollateralTypes[collats[i]] = collateralType;
            lockedCollateral[user][collats[i]] = newLockedCollat;
            unlockedCollateral[user][collats[i]] = newUnlockedCollat;
        }

        uint256 rateMult = StabilityRate;
        uint256 mintingFee = _rmul(normalDebtChange * rateMult, MintFee);
        if(PSMAddresses[user]){
            rateMult = RAY;
            mintingFee = 0;
        }

        //Need to check to make sure its under liquidation amount
        normalDebt[user]    += normalDebtChange;
        totalNormalizedDebt += normalDebtChange;

        require(_rmul(getPortfolioValue(user), liquidationMult) > normalDebt[user] * rateMult 
            && getMaxDPrimeDebt(user) > normalDebt[user] * rateMult, 
            "LMCV/Minting more dPrime than allowed"
        );
        
        dPrimeTotalDebt += normalDebtChange * rateMult;
        require(dPrimeTotalDebt < ProtocolDebtCeiling, "LMCV/Cannot extend past protocol debt ceiling");

        //Last thing that happens is actual ability to mint dPrime
        dPrime[Treasury] += mintingFee;
        dPrime[user] += normalDebtChange * rateMult - mintingFee; //Test
        emit Loan(normalDebt[user], user, collats, collateralChange);
    }

    //Repay any percentage of the loan and unlock collateral
    //Or repay none if overcollateralized properly
    function repay(
        bytes32[] memory collats, 
        uint256[] memory collateralChange, // [wad]
        uint256 normalDebtChange, // [wad]
        address user
    ) external loanAlive {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        require(approval(user, msg.sender), "LMCV/Owner must consent");
        
        uint256 rateMult = PSMAddresses[user] ? RAY : StabilityRate;

        dPrime[user]        -= normalDebtChange * rateMult;
        dPrimeTotalDebt     -= normalDebtChange * rateMult;
        normalDebt[user]    -= normalDebtChange;
        totalNormalizedDebt -= normalDebtChange;
        
        for(uint256 i = 0; i < collats.length; i++){
            CollateralType storage collateralType = CollateralTypes[collats[i]];

            uint256 newLockedCollat = lockedCollateral[user][collats[i]];
            uint256 newUnlockedCollat = unlockedCollateral[user][collats[i]];

            //Change from locked collateral to unlocked collateral
            newLockedCollat -= collateralChange[i];
            newUnlockedCollat += collateralChange[i];

            require(newLockedCollat > collateralType.debtFloor || newLockedCollat == 0, "LMCV/Collateral must be higher than dust level");

            //New locked collateral set then immediately check solvency
            //Has to call getWeightedRate again because weighted rate has changed since above
            lockedCollateral[user][collats[i]] = newLockedCollat;
            require(getMaxDPrimeDebt(user) >= normalDebt[user] * rateMult, "LMCV/More dPrime left than allowed");

            //Give user their unlocked collateral
            collateralType.totalDebt -= collateralChange[i];
            unlockedCollateral[user][collats[i]] = newUnlockedCollat;
        }

        //Remove collateral from locked list if fully repaid
        bytes32[] storage lockedCollats = lockedCollateralList[user];
        for(uint j = lockedCollats.length; j > 0; j--){
            uint256 iter = j-1;
            if(lockedCollateral[user][lockedCollats[iter]] == 0){
                deleteElement(lockedCollats, iter);
            }
        }

        emit LoanRepayment(normalDebt[user], user, collats, collateralChange);
    }

    //Coin prices increase and they want to take out more without changing collateral
    //Or coin prices decrease and they want to repay dPrime
    function addLoanedDPrime(address user, uint256 normalDebtChange) loanAlive external { // [wad]
        require(approval(user, msg.sender), "LMCV/Owner must consent");

        uint256 rateMult = StabilityRate;
        uint256 mintingFee = _rmul(normalDebtChange * rateMult, MintFee);
        if(PSMAddresses[user]){
            rateMult = RAY;
            mintingFee = 0;
        }

        normalDebt[user] += normalDebtChange;
        totalNormalizedDebt += normalDebtChange;
        require(_rmul(getPortfolioValue(user), liquidationMult) > normalDebt[user] * rateMult 
            && getMaxDPrimeDebt(user) > normalDebt[user] * rateMult, 
            "LMCV/Minting more dPrime than allowed"
        );
        
        dPrimeTotalDebt += normalDebtChange * rateMult;
        require(dPrimeTotalDebt < ProtocolDebtCeiling, "LMCV/Cannot extend past protocol debt ceiling");

        //Last thing that happens is actual ability to mint dPrime
        dPrime[Treasury] += mintingFee;
        dPrime[user] += normalDebtChange * rateMult - mintingFee; //Test
        emit AddLoanedDPrime(user, normalDebtChange);
    }

    //Basic liquidation to allow for liquidation contract management
    function liquidate(
        bytes32[] memory collats,
        uint256[] memory collateralChange,  // [wad]
        uint256 normalDebtChange,           // [wad]
        address liquidated, 
        address liquidator,
        address liquidationContract         // assigned the liquidation debt
    ) external auth {
        require(collats.length == collateralChange.length, "LMCV/Need amount for each collateral");
        uint256 dPrimeDebt = normalDebtChange * StabilityRate;

        //Add debt to the protocol's liquidation contract
        totalLiquidationDebt += dPrimeDebt;
        liquidationDebt[liquidationContract] += dPrimeDebt;

        // Move collateral from liquidated address to liquidator's address
        for(uint256 i = 0; i < collats.length; i++){
            bytes32 collateral = collats[i];
            CollateralTypes[collateral].totalDebt -= collateralChange[i];
            lockedCollateral[liquidated][collateral] -= collateralChange[i];
            unlockedCollateral[liquidator][collateral] += collateralChange[i];
        }

        normalDebt[liquidated] -= normalDebtChange;
        totalNormalizedDebt -= normalDebtChange;
        dPrimeTotalDebt -= dPrimeDebt;
        emit Liquidation(liquidated, liquidator, normalDebtChange, collats, collateralChange);
    }

    // --- Settlement ---
    // Only liquidation contract can successfully call repayLiquidationDebt
    function repayLiquidationDebt(uint256 rad) external {
        address u = msg.sender;
        liquidationDebt[u] -= rad;
        dPrime[u] -= rad;
        totalLiquidationDebt -= rad;
        dPrimeTotalDebt -= rad;

        emit RepayLiquidationDebt(msg.sender, rad);
    }

    function createLiquidationDebt(address debtReceiver, address dPrimeReceiver, uint256 rad) external auth {
        liquidationDebt[debtReceiver] += rad;
        dPrime[dPrimeReceiver] += rad;
        totalLiquidationDebt += rad;
        dPrimeTotalDebt += rad;

        emit CreateLiquidationDebt(debtReceiver, dPrimeReceiver, rad);
    }

    // --- Rates ---
    function updateRate(int256 rateIncrease) external auth loanAlive {
        StabilityRate       = _add(StabilityRate, rateIncrease);
        int256 rad          = _int256(totalNormalizedDebt - totalPSMDebt) * rateIncrease;
        dPrime[Treasury]    = _add(dPrime[Treasury], rad);
        dPrimeTotalDebt     = _add(dPrimeTotalDebt, rad);

        emit UpdateRate(rateIncrease);
    }

    // --- Helpers ---
    function isHealthy(address user) public view returns (bool healthy){
        if(_rmul(getPortfolioValue(user), liquidationMult) > normalDebt[user] * StabilityRate){
            return true;
        }
        return false;
    }

    function getMaxDPrimeDebt(address user) public view returns (uint256 maxDPrime) { // [rad]
        bytes32[] storage lockedList = lockedCollateralList[user];
        for(uint256 i = 0; i < lockedList.length; i++){
            CollateralType storage collateralType = CollateralTypes[lockedList[i]];
            if(lockedCollateral[user][lockedList[i]] > collateralType.debtFloor){
                uint256 value = lockedCollateral[user][lockedList[i]] * collateralType.spotPrice; // wad*ray -> rad
                maxDPrime += _rmul(value, collateralType.debtMult); // rmul(rad, ray) -> rad
            }
        }
        return maxDPrime;
    }

    function getPortfolioValue(address user) public view returns (uint256 value){ // [rad]
        bytes32[] storage lockedList = lockedCollateralList[user];
        uint256 nlVal;
        uint256 lVal;
        for(uint256 i = 0; i < lockedList.length; i++){
            CollateralType storage collateralType = CollateralTypes[lockedList[i]];
            if(lockedCollateral[user][lockedList[i]] > collateralType.debtFloor){
                if(!collateralType.leveraged){
                    nlVal += lockedCollateral[user][lockedList[i]] * collateralType.spotPrice; // wad*ray -> rad
                } else {
                    lVal += lockedCollateral[user][lockedList[i]] * collateralType.spotPrice;
                }
            }
        }
        // console.log("FNOLEV:        %s", nlVal);
        // console.log("FLEVERED:      %s", lVal);
        // console.log("FRMUL:         %s\n", _rmul(nlVal, RAY + lVal * RAY / nlVal));
        return _rmul(nlVal, RAY + lVal * RAY / nlVal);
    }

    //TODO: Do we need this?
    function getLeverMult(address user) external view returns (uint256 leverMult){ // [ray]
        bytes32[] storage lockedList = lockedCollateralList[user];
        uint256 nlVal;
        uint256 lVal;
        for(uint256 i = 0; i < lockedList.length; i++){
            CollateralType storage collateralType = CollateralTypes[lockedList[i]];
            if(lockedCollateral[user][lockedList[i]] > collateralType.debtFloor){
                if(!collateralType.leveraged){
                    nlVal += lockedCollateral[user][lockedList[i]] * collateralType.spotPrice; // wad*ray -> rad
                } else {
                    lVal += lockedCollateral[user][lockedList[i]] * collateralType.spotPrice;
                }
            }
        }
        return RAY + lVal * RAY / nlVal;
    }

    function getUnlockedCollateralValue(address user, bytes32[] memory collateralList) external view returns (uint256 unlockedValue) {
        for(uint256 i = 0; i < collateralList.length; i++){
            CollateralType storage collateralType = CollateralTypes[collateralList[i]];
            if(unlockedCollateral[user][collateralList[i]] > collateralType.debtFloor){
                unlockedValue += (unlockedCollateral[user][collateralList[i]] * collateralType.spotPrice); // wad*ray -> rad
            }
        }
        return unlockedValue;
    }

    function either(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := or(x, y)}
    }

    //WARNING: Does not care about order
    function deleteElement(bytes32[] storage array, uint256 i) internal {
        require(i < array.length, "Array out of bounds");
        array[i] = array[array.length-1];
        array.pop();
    }

    //TODO: Only for testing
    function bytes32ToString(bytes32 _bytes32) public pure returns (string memory) {
        uint8 i = 0;
        while(i < 32 && _bytes32[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }
}
