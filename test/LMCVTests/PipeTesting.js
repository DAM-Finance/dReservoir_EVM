const {expect} = require("chai");
const {ethers} = require("hardhat");

let owner, addr1, addr2, addr3, addrs;
let d2oFactory, srcd2o, dstd2o;
let hyperlanePipeFactory;
let LZPipeFactory, srcLZPipe, dstLZPipe;
let lzMockEndpointFactory;
let hyperlaneMockEnvironment, hyperlaneMockEnvironmentFactory;
let userd2o;

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

async function byteify(address){
    return ethers.utils.hexZeroPad(ethers.utils.hexlify(address), 32)
}


//Format as wad, ray, rad
function fwad(wad){ return ethers.utils.parseEther(wad)}
function fray(ray){ return ethers.utils.parseEther(ray).mul("1000000000")}
function frad(rad){ return ethers.utils.parseEther(rad).mul("1000000000000000000000000000")}
//Parse from wad,ray,rad
function pwad(bigNumber){ return bigNumber.div("1000000000000000000")}
function pray(bigNumber){ return bigNumber.div("1000000000000000000000000000")} 
function prad(bigNumber){ return bigNumber.div("1000000000000000000000000000000000000000000000")}

async function setupUser(addr, amounts){
    let mockTokenConnect = USDCMock.connect(addr);
    let mockToken2Connect = tokenTwo.connect(addr);
    
    await mockTokenConnect.approve(collateralJoin.address);
    await mockToken2Connect.approve(collatJoinTwo.address, MAX_INT);

    await mockTokenConnect.mint(fwad(amounts.at(0)));
    await mockToken2Connect.mint(fwad(amounts.at(0)));
}

describe("Testing LMCV", function () {

    before(async function () {
        d2oFactory                      = await ethers.getContractFactory("d2O");
        hyperlanePipeFactory            = await ethers.getContractFactory("HyperlanePipe");
        LZPipeFactory                   = await ethers.getContractFactory("LayerZeroPipe");
        lzMockEndpointFactory           = await ethers.getContractFactory("LZEndpointMock");
        hyperlaneMockEnvironmentFactory    = await ethers.getContractFactory("MockHyperlaneEnvironment");
    });

    beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

        srcd2o          = await d2oFactory.deploy();
        srcLZEndpoint   = await lzMockEndpointFactory.deploy("1");
        srcLZPipe       = await LZPipeFactory.deploy(srcLZEndpoint.address, srcd2o.address, owner.address);
        srcHLPipe       = await hyperlanePipeFactory.deploy();
        
        dstd2o          = await d2oFactory.deploy();
        dstLZEndpoint   = await lzMockEndpointFactory.deploy("2");
        dstLZPipe       = await LZPipeFactory.deploy(dstLZEndpoint.address, dstd2o.address, owner.address);
        dstHLPipe       = await hyperlanePipeFactory.deploy();

        await srcd2o.rely(srcLZPipe.address);
        await dstd2o.rely(dstLZPipe.address);
        await srcd2o.rely(srcHLPipe.address);
        await dstd2o.rely(dstHLPipe.address);
        

        // LZ Setup

        await srcLZPipe.setTeleportFee(fray("0.003"));
        await srcLZPipe.setTrustedRemoteAddressAuth("2", dstLZPipe.address);
        await srcLZEndpoint.setDestLzEndpoint(dstLZPipe.address, dstLZEndpoint.address);
        

        await dstLZPipe.setTeleportFee(fray("0.003"));
        await dstLZPipe.setTrustedRemoteAddressAuth("1", srcLZPipe.address);
        await dstLZEndpoint.setDestLzEndpoint(srcLZPipe.address, srcLZEndpoint.address);

        // HL Setup

        hyperlaneMockEnvironment = await hyperlaneMockEnvironmentFactory.deploy(1, 2);

        await srcHLPipe.initialize(await hyperlaneMockEnvironment.mailboxes(1), await hyperlaneMockEnvironment.igps(1), srcd2o.address, 100000, owner.address)
        await dstHLPipe.initialize(await hyperlaneMockEnvironment.mailboxes(2), await hyperlaneMockEnvironment.igps(2), dstd2o.address, 100000, owner.address)

        await srcHLPipe.setTeleportFee(fray("0.003"));
        await srcHLPipe.enrollRemoteRouter(2, byteify(dstHLPipe.address));

        

        await dstHLPipe.setTeleportFee(fray("0.003"));
        await dstHLPipe.enrollRemoteRouter(1, byteify(srcHLPipe.address));

        userd2o = srcd2o.connect(addr1);



    });

    describe("Layer Zero Pipe testing", function () {

        it("Should properly transfer using mock endpoint with fees", async function () {

            let userSrcLZPipe = srcLZPipe.connect(addr1);

            await srcd2o.mint(addr1.address, fwad("10000"));

            let adapterParams = ethers.utils.solidityPack(
                ['uint16','uint256'],
                [1, 200000]
            )

            let feeEstimate = await userSrcLZPipe.estimateSendFee("2", addr1.address, fwad("1000"), false, adapterParams);
            await userSrcLZPipe.sendFrom(addr1.address, "2", addr1.address, fwad("1000"), addr1.address, addr1.address, [], {value: feeEstimate.nativeFee});

            expect(await dstd2o.balanceOf(addr1.address)).to.equal(fwad("997"));
            expect(await dstd2o.balanceOf(owner.address)).to.equal(fwad("3"));

            expect(await srcd2o.balanceOf(addr1.address)).to.equal(fwad("9000"));
            expect(await srcd2o.balanceOf(owner.address)).to.equal(fwad("0"));
        });
    });

    describe("Hyperlane Pipe testing", function () {

        it("Should properly transfer using mock endpoint with fees", async function () {
            console.log("Treasury:" + await srcHLPipe.treasury());
            console.log("Teleport Fee:" + await srcHLPipe.teleportFee());

            let userSrcHLPipe = srcHLPipe.connect(addr1);

            await srcd2o.mint(addr1.address, fwad("10000"));

            await userSrcHLPipe.transferRemote(2, byteify(addr1.address), fwad("1000"), {value: 100000});

            await hyperlaneMockEnvironment.processNextPendingMessage()

            expect(await srcd2o.balanceOf(addr1.address)).to.equal(fwad("9000"));
            expect(await srcd2o.balanceOf(owner.address)).to.equal(fwad("0"));

            expect(await dstd2o.balanceOf(addr1.address)).to.equal(fwad("997"));
            expect(await dstd2o.balanceOf(owner.address)).to.equal(fwad("3"));

            
        });

        it("Should fail if minimum gas amount is not sent", async function () {
            console.log("Treasury:" + await srcHLPipe.treasury());
            console.log("Teleport Fee:" + await srcHLPipe.teleportFee());

            let userSrcHLPipe = srcHLPipe.connect(addr1);

            await srcd2o.mint(addr1.address, fwad("10000"));

            await srcHLPipe.setGasAmount(999999)

            await expect(userSrcHLPipe.transferRemote(2, byteify(addr1.address), fwad("1000"), {value: 20000})).to.be.revertedWith("d2OConnectorHyperlane/Must have enough gas")
        });
    });

    

});

