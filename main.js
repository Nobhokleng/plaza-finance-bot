import axios from 'axios';
import { readWallets, readProxyFile } from "./utils/script.js";
import banner from "./utils/banner.js";
import log from "./utils/logger.js";
import performTransactions from './utils/transactions.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { claimCoupon, mintNft, signMessage } from './utils/contract.js';

const reffCode = `bfc7b70e-66ad-4524-9bb6-733716c4da94`;
const proxyPath = 'proxy.txt';
const userAgentPath = 'userAgent.txt';
const decimal = 1e18;

const createAxiosInstance = (proxyUrl = null, ua = null) => {
    const baseURL = 'https://api.plaza.finance/';
    const instanceHeaders = {
        'Content-Type': 'application/json',
        'Referer': 'https://testnet.plaza.finance/',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'x-plaza-api-key': reffCode,
        'x-plaza-vercel-server': 'undefined',
        'User-Agent': ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    };

    const config = { baseURL, headers: instanceHeaders };
    if (proxyUrl) {
        const agent = new HttpsProxyAgent(proxyUrl);
        config.httpAgent = agent;
        config.httpsAgent = agent;
    }

    return axios.create(config);
};

const randomDelay = async (min = 5, max = 10) => {
    const waitTime = Math.random() * (max - min) * 1000 + min * 1000;
    log.info(`Waiting for ${(waitTime / 1000).toFixed(2)} seconds...`);
    return new Promise(resolve => setTimeout(resolve, waitTime));
};


const getFaucet = async (address, proxyUrl, ua) => {
    const axiosInstance = createAxiosInstance(proxyUrl, ua);
    try {
        const response = await axiosInstance.post('/faucet/queue', { address });
        log.info(`Faucet Response: Success, ${response?.data}`);
        return 'success';
    } catch (error) {
        log.error(`Error when claim faucet: ${error.response?.data?.message || error.message}`);
        return null;
    }
};

const fetchUser = async (address, proxyUrl, ua) => {
    const axiosInstance = createAxiosInstance(proxyUrl, ua);
    try {
        const response = await axiosInstance.get(`/user?user=${address}`);
        return response.data;
    } catch (error) {
        log.error(`Error fetching user: ${error.response?.data?.message || error.message}`);
        return null;
    }
};

const fetchUserCoupon = async (address, proxyUrl, ua) => {
    const axiosInstance = createAxiosInstance(proxyUrl, ua);
    try {
        const response = await axiosInstance.get(`/user/v1/coupons`, {
            params: { user: address, networkId: 84532 },
        });
        return response.data;
    } catch (error) {
        log.error(`Error fetching balance: ${error.response?.data?.message || error.message}`);
        return null;
    }
};

const claimRequest = async (address, proxyUrl, ua) => {
    const axiosInstance = createAxiosInstance(proxyUrl, ua);
    try {
        const response = await axiosInstance.post(`/referrals/claim`, { address, code: 'GD7UtSTaYphb' });
        return response.data;
    } catch (error) {
        return null;
    }
};

const fetchUserBalance = async (address, proxyUrl, ua) => {
    const axiosInstance = createAxiosInstance(proxyUrl, ua);
    try {
        const response = await axiosInstance.get(`/user/balances`, {
            params: { networkId: 84532, user: address },
        });
        return response.data;
    } catch (error) {
        log.error(`Error fetching balance: ${error.response?.data?.message || error.message}`);
        return null;
    }
};
const getSign = async (level, user, signature, proxyUrl, ua) => {
    const axiosInstance = createAxiosInstance(proxyUrl, ua);
    try {
        const response = await axiosInstance.post('/gamification/claim-level-rewards', { level, user, signature })
        return response.data.signature;
    } catch (error) {
        log.error(`Error when getting signature: ${error.response?.data?.message || error.message}`);
        if (error.response?.data?.message === 'User already claimed the reward') {
            return 'claimed';
        }
        return null;
    }
};

const claimNftReward = async ({ points, nftType, requiredPoints, wallet, proxy, ua, claimedState}) => {
    const walletKey = wallet.address.toLowerCase();
    if (claimedState[walletKey][`nft${nftType}`] || points < requiredPoints) return;

    log.info(`=== Claiming NFT ${nftType} Rewards for Address: ${wallet.address} ===`);
    const signWallet = await signMessage(wallet.privateKey);
    const signature = await getSign(nftType, wallet.address, signWallet, proxy, ua);

    if (signature && signature !== 'claimed') {
        const mintResult = await mintNft(wallet.privateKey, signature);
        if (mintResult) {
            log.info(`=== NFT ${nftType} Successfully Claimed ===`);
            claimedState[walletKey][`nft${nftType}`] = true;
        } else {
            log.error(`=== Failed to Claim NFT ${nftType} ===`);
        }
    } else if (signature === 'claimed') {
        claimedState[walletKey][`nft${nftType}`] = true;
    }

    if (!claimedState[walletKey][`nft${nftType}`]) {
        log.info(`=== No NFT Rewards For This Address ===`);
    } else {
        log.info(`=== NFT Rewards Already Claimed For This Address ===`);
    }
};

const main = async () => {
    log.warn(banner);
    const wallets = readWallets();
    const proxyList = readProxyFile(proxyPath);
    const userAgentList = readProxyFile(userAgentPath);
    let index = 0;
    const claimedState = {};

    while (true) {
        for (const wallet of wallets) {
            const walletKey = wallet.address.toLowerCase();
            claimedState[walletKey] = claimedState[walletKey] || { nft1: false, nft2: false, nft3: false, nft4: false, nft5: false };

            const proxy = proxyList.length > 0 ? proxyList[index % proxyList.length] : null;
            const ua = userAgentList.length > 0 ? userAgentList[index % userAgentList.length] : null;
            log.warn(`Running Using Proxy: ${proxy || 'No Proxy'}`);

            try {
                await claimRequest(wallet.address, proxy, ua);

                const profile = await fetchUser(wallet.address, proxy, ua);
                const level = profile?.level || 0;
                const points = profile?.points || 0;
                log.info(`=== Address: ${wallet.address} | Level: ${level} | Points: ${points} ===`);

                log.info(`=== check coupon ===`);
                const couponClaimable = await fetchUserCoupon(wallet.address, proxy, ua);
                if (couponClaimable[0]["shares"] != 0) {
                    const couponResult = await claimCoupon(wallet.privateKey);
                    log.info(`=== couponResult ${couponResult} ===`);

                } else {
                    log.info(`=== no coupon ===`);
                }

                log.info(`=== Checking NFT Rewards ===`);
                for (let nftType = 1; nftType <= 9; nftType++) {
                    await claimNftReward({
                        points,
                        nftType,
                        requiredPoints: [0, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000][nftType],
                        wallet,
                        proxy,
                        ua,
                        claimedState,
                    });
                }

                log.info(`=== Checking Balance ===`);
                const balances = await fetchUserBalance(wallet.address, proxy, ua);
                const balance = parseInt(balances[0]?.balanceRaw, 10) / decimal || 0;
                log.info(`=== Address: ${wallet.address} | wstETH Balance : ${balance} ===\n`);

                if (balance < 0.02) {
                    log.info(`=== Not Enough wstETH, Trying to Claim Faucet ===`);
                    const faucet = await getFaucet(wallet.address, proxy, ua);
                    await randomDelay(15, 20);
                }
                
                log.info(`Starting Perform Transactions for address: ${wallet.address}`);
                await performTransactions(wallet.privateKey, 0);
                await performTransactions(wallet.privateKey, 1);
                await randomDelay(5, 15);

                index++;
            } catch (err) {
                console.error(err);
            }
        }
        log.info('Sleeping for 24 hours...');
        await new Promise(resolve => setTimeout(resolve, 24 * 60 * 60 * 1000));
    }
};
// run
main();
