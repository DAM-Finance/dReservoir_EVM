// SPDX-License-Identifier: MIT

// Inspiration from mSpell and DAM's own LMCV

// - `wad`: fixed point decimal with 18 decimals (for basic quantities, e.g. balances)
// - `ray`: fixed point decimal with 27 decimals (for precise quantites, e.g. ratios)
// - `rad`: fixed point decimal with 45 decimals (result of integer multiplication with a `wad` and a `ray`)

pragma solidity ^0.8.12;

interface LMCVLike {
    function lockedCollateral(address, bytes32) external view returns (uint256 amount);
    function unlockedCollateral(address, bytes32) external view returns (uint256 amount);
}

interface d3OLike{
    function balanceOf(address) external view returns (uint256 amount);
}

contract StakingVault {

    //
    // Authorisation.
    //

    address public ArchAdmin;
    mapping (address => uint256) public admins;
    mapping (address => mapping (address => uint256))    public proxyApprovals;

    struct RewardTokenData {
        uint256 totalRewardAmount;              // [wad] total amount of a specific reward token
        uint256 accumulatedRewardPerStaked;     // [ray] amount of reward per staked token
    }


    bytes32[]                                           public RewardTokenList;         // list of rewards tokens
    mapping (bytes32 => RewardTokenData)                public RewardData;

    mapping (address => mapping (bytes32 => uint256))   public rewardDebt;              // [wad] - amount already should've been paid out from time 0
    mapping (address => mapping (bytes32 => uint256))   public withdrawableRewards;     // [wad] - user can withdraw these rewards after unstaking

    mapping (address => uint256)                        public lockedStakeable;         // [wad] - staked amount per user
    mapping (address => uint256)                        public unlockedStakeable;       // [wad] - does not count towards staked tokens.
    mapping (address => uint256)                        public d3O;                     // [rad] - user's d3O balance.

    uint256 public totalD3O;            // [rad] - Total amount of d3O issued.
    uint256 public stakedAmount;            // [wad] - amount staked.
    uint256 public stakedAmountLimit;       // [wad] - max amount allowed to stake
    uint256 public stakedMintRatio;         // [ray] - ratio of staked tokens per d3O


    event EditRewardsToken(bytes32 indexed rewardToken, bool accepted, uint256 spot, uint256 position);
    event LiquidationWithdraw(address indexed liquidated, address indexed liquidator, uint256 rad);
    event PullRewards(bytes32 indexed rewardToken, address indexed usr, uint256 wad);
    event MoveD3O(address indexed src, address indexed dst, uint256 rad);
    event PushRewards(bytes32 indexed rewardToken, uint256 wad);
    event RemoveRewards(bytes32 indexed rewardToken, uint256 wad);
    event UpdateRewards(bytes32 indexed rewardToken, uint256 ray);
    event PushStakingToken(address indexed user, uint256 amount);
    event PullStakingToken(address indexed user, uint256 amount);
    event Unstake(uint256 amount, address indexed user);
    event Stake(int256 amount, address indexed user);
    event SetStakeAlive(uint256 status);
    event RewardSpotPrice(bytes32 indexed rewardToken, uint256 ray);
    event StakedMintRatio(uint256 ray);
    event StakedAmountLimit(uint256 wad);
    
    

    //
    // Admin.
    //

    uint256 public stakeLive;
    address public lmcv;
    bytes32 public d3OBytes;
    address public d3OContract;

    modifier auth() {
        require(admins[msg.sender] == 1, "StakingVault/Not Authorized");
        _;
    }

    modifier stakeAlive() {
        require(stakeLive == 1, "StakingVault/Loan paused");
        _;
    }

    constructor(bytes32 _d3OBytes, address _d3OContract, address _lmcv) {
        require(_d3OContract != address(0), "StakingVault/d3OContract address cannot be zero");
        require(_lmcv != address(0) && _d3OContract != address(0), "StakingVault/Address cannot be zero");
        d3OBytes = _d3OBytes;        // bytes32 of d3O in LMCV for lookup in locked collateral list
        d3OContract     = _d3OContract;     // Address of d3O for balance lookup
        lmcv                = _lmcv;
        ArchAdmin           = msg.sender;
        stakeLive           = 1;
        admins[msg.sender]  = 1;
    }

    //
    // Authorisation.
    //

    function setArchAdmin(address newArch) external auth {
        require(ArchAdmin == msg.sender && newArch != address(0), "StakingVault/Must be ArchAdmin");
        ArchAdmin = newArch;
        admins[ArchAdmin] = 1;
    }

    function administrate(address admin, uint256 authorization) external auth {
        require(admin != ArchAdmin || authorization == 1, "StakingVault/ArchAdmin cannot lose admin - update ArchAdmin to another address");
        admins[admin] = authorization;
    }

    function approve(address user) external {
        proxyApprovals[msg.sender][user] = 1;
    }

    function disapprove(address user) external {
        proxyApprovals[msg.sender][user] = 0;
    }

    function approval(address bit, address user) internal view returns (bool) {
        return either(bit == user, proxyApprovals[bit][user] == 1);
    }


    //
    // Math.
    //

    uint256 private constant RAY = 10 ** 27;
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

    function _sub(uint256 x, int256 y) internal pure returns (uint256 z) {
        unchecked {
            z = x - uint256(y);
        }
        require(y <= 0 || z <= x);
        require(y >= 0 || z >= x);
    }

    function _int256(uint256 x) internal pure returns (int256 y) {
        require((y = int256(x)) >= 0);
    }

    //
    // Protocol Admin
    //

    function setStakeAlive(uint256 status) external auth {
        stakeLive = status;
        emit SetStakeAlive(status);
    }

    function setStakedAmountLimit(uint256 wad) external auth {
        stakedAmountLimit = wad;
        emit StakedAmountLimit(wad);
    }

    function setStakedMintRatio(uint256 ray) external auth {
        stakedMintRatio = ray;
        emit StakedMintRatio(ray);
    }


    //
    // Rewards Admin
    //

    function pushRewards(bytes32 rewardToken, uint256 wad) external auth {
        require(stakedAmount != 0, "StakingVault/Staked amount must be greater than 0 to put rewards in");
        RewardTokenData storage tokenData = RewardData[rewardToken];
        tokenData.totalRewardAmount             += wad;
        tokenData.accumulatedRewardPerStaked    += wad * RAY / stakedAmount; // wad * RAY / wad = ray
        emit PushRewards(rewardToken, wad);
    }

    function editRewardsTokenList(bytes32 rewardToken, bool accepted, uint256 position) external auth {
        if(accepted){
            for (uint256 i = 0; i < RewardTokenList.length; i++) {
                require(RewardTokenList[i] != rewardToken, "StakingVault/Can't add reward token more than once");
            }
            RewardTokenList.push(rewardToken);
        }else{
            deleteElement(RewardTokenList, position);
        }
    }

    //
    // Stake Token User Functionality
    //

    function pushStakingToken(address user, uint256 wad) external auth {
        unlockedStakeable[user] += wad;
        emit PushStakingToken(user, wad);
    }

    function pullStakingToken(address user, uint256 wad) external auth {
        require(unlockedStakeable[user] >= wad, "StakingVault/Insufficient unlocked stakeable token to pull");
        unlockedStakeable[user] -= wad;
        emit PullStakingToken(user, wad);
    }

    //
    // d3O
    //

    function moveD3O(address src, address dst, uint256 rad) external {
        require(approval(src, msg.sender), "StakingVault/d3O move not allowed");
        d3O[src] -= rad;
        d3O[dst] += rad;
        emit MoveD3O(src, dst, rad);
    }

    //
    // Rewards User Functions
    //
    
    function pullRewards(bytes32 rewardToken, address usr, uint256 wad) external auth {
        RewardTokenData storage tokenData = RewardData[rewardToken];
        require(withdrawableRewards[usr][rewardToken] >= wad, "StakingVault/Insufficient withdrawable rewards to pull");
        withdrawableRewards[usr][rewardToken]   -= wad;
        tokenData.totalRewardAmount             -= wad;
        emit PullRewards(rewardToken, usr, wad);
    }


    //
    // Main functionality
    //
    function stake(int256 wad, address user) external stakeAlive { // [wad]
        require(approval(user, msg.sender), "StakingVault/Owner must consent");
        require(getOwnedD3O(user) >= lockedStakeable[user] * stakedMintRatio, "StakingVault/Need to own d3O to cover locked amount");

        //1. Add locked tokens
        uint256 prevStakedAmount    = lockedStakeable[user]; //[wad]
        unlockedStakeable[user]     = _sub(unlockedStakeable[user], wad);
        lockedStakeable[user]       = _add(lockedStakeable[user], wad);
        stakedAmount                = _add(stakedAmount, wad);
        require(stakedAmount <= stakedAmountLimit || wad < 0, "StakingVault/Cannot be over staked token limit");

        //2. Set reward debts for each token based on current time and staked amount
        _payRewards(user, user, prevStakedAmount);

        //3. Set d3O
        totalD3O    = _add(totalD3O, wad * _int256(stakedMintRatio));
        d3O[user]   = _add(d3O[user], wad * _int256(stakedMintRatio));

        emit Stake(wad, user);
    }

    //This will be how accounts that are liquidated with d3O in them are recovered
    //This also implicitly forbids the transfer of your assets anywhere except LMCV and your own wallet
    function liquidationWithdraw(address liquidator, address liquidated, uint256 rad) external stakeAlive {
        require(approval(liquidator, msg.sender), "StakingVault/Owner must consent");

        //1. Check that liquidated does not own d3O they claim to
        require(getOwnedD3O(liquidated) <= lockedStakeable[liquidated] * stakedMintRatio - rad, "StakingVault/Account must not have ownership of tokens");
        uint256 liquidatedAmount         = rad / stakedMintRatio; // rad / ray = wad
        uint256 prevStakedAmount         = lockedStakeable[liquidated]; //[wad]

        //2. Take d3O from liquidator's account to repay
        require(d3O[liquidator] >= rad, "StakingVault/Insufficient d3O to liquidate");
        d3O[liquidator]             -= rad;
        totalD3O                    -= rad;

        //3. Settle staking token amounts
        lockedStakeable[liquidated]     -= liquidatedAmount;
        unlockedStakeable[liquidator]   += liquidatedAmount;
        stakedAmount                    -= liquidatedAmount;

        //4. Pay out rewards to the liquidator
        _payRewards(liquidated, liquidator, prevStakedAmount);

        emit LiquidationWithdraw(liquidated, liquidator, rad);
    }

    function _payRewards(address from, address to, uint256 previousAmount) internal {
        for (uint256 i = 0; i < RewardTokenList.length; i++) {
            RewardTokenData storage tokenData = RewardData[RewardTokenList[i]];

            //Save prev reward debt and set new reward debt
            uint256 prevRewardDebt = rewardDebt[from][RewardTokenList[i]]; // [wad]
            rewardDebt[from][RewardTokenList[i]] = _rmul(lockedStakeable[from], tokenData.accumulatedRewardPerStaked); // rmul(wad, ray) = wad;

            //Pay out rewards
            if(previousAmount > 0){
                uint256 payout = _rmul(previousAmount, tokenData.accumulatedRewardPerStaked) - prevRewardDebt; // rmul(wad,ray) - wad = wad;

                if(payout > 0){
                    withdrawableRewards[to][RewardTokenList[i]] += payout;
                }
            }
        }
    }

    function getOwnedD3O(address user) public view returns (uint256 rad) {
        return LMCVLike(lmcv).lockedCollateral(user, d3OBytes)      * RAY
            +  LMCVLike(lmcv).unlockedCollateral(user, d3OBytes)    * RAY
            +  d3OLike(d3OContract).balanceOf(user)             * RAY
            +  d3O[user];
    }

    //
    // Helpers
    //

    function either(bool x, bool y) internal pure returns (bool z) {
        assembly{ z := or(x, y)}
    }

     //WARNING: Does not care about order
    function deleteElement(bytes32[] storage array, uint256 i) internal {
        require(i < array.length, "Array out of bounds");
        array[i] = array[array.length-1];
        array.pop();
    }

    //
    // Testing
    //

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