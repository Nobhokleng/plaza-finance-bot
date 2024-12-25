import axios from 'axios';
import { readWallets, readProxyFile } from "./utils/script.js";
import banner from "./utils/banner.js";
import log from "./utils/logger.js";
import performTransactions from './utils/transactions.js';

const reffCode = `79022527-58f7-4562-8be8-396ff8bae49f`;
const proxyPath = 'proxy.txt';
const decimal = 1000000000000000000;

const headers = {
    'Content-Type': 'application/json',
    'Referer': 'https://testnet.plaza.finance/',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'x-plaza-api-key': reffCode,
    'x-plaza-vercel-server': 'undefined',
};

const createAxiosInstance = (proxyUrl) => {
    return axios.create({
        baseURL: 'https://api.plaza.finance/',
        headers,
        proxy: proxyUrl
            ? {
                protocol: 'http',
                host: proxyUrl.split(':')[0],
                port: parseInt(proxyUrl.split(':')[1], 10),
            }
            : false,
    });
};

const getFaucet = async (address, proxyUrl) => {
    const axiosInstance = createAxiosInstance(proxyUrl);
    try {
        const response = await axiosInstance.post('/faucet/queue', { address });
        log.info(`Faucet Response: Success`);
        return 'success';
    } catch (error) {
        log.error(`Error when claim faucet: ${error.response?.data?.message || error.message}`);
        return null;
    }
};

const fetchUser = async (address, proxyUrl) => {
    const axiosInstance = createAxiosInstance(proxyUrl);
    try {
        const response = await axiosInstance.get(`/user?user=${address}`);
        return response.data;
    } catch (error) {
        log.error(`Error fetching user: ${error.response?.data?.message || error.message}`);
        return null;
    }
};

const claimRequest = async (address, proxyUrl) => {
    const axiosInstance = createAxiosInstance(proxyUrl);
    try {
        const response = await axiosInstance.post(`/referrals/claim`, { address, code: 'thtlP8i4fgzf' });
        return response.data;
    } catch (error) {
        return null;
    }
};

const fetchUserBalance = async (address, proxyUrl) => {
    const axiosInstance = createAxiosInstance(proxyUrl);
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

const main = async () => {
    log.warn(banner);
    const wallets = readWallets();
    const proxyList = readProxyFile(proxyPath);
    let index = 0;

    for (const wallet of wallets) {
        const proxy = proxyList.length > 0 ? proxyList[index % proxyList.length] : null;
        log.warn(`Running Using Proxy: ${proxy || 'No Proxy'}`);
        try {
            await claimRequest(wallet.address, proxy);

            const profile = await fetchUser(wallet.address, proxy);
            const level = profile?.level || 0;
            const points = profile?.points || 0;
            log.info(`=== Address: ${wallet.address} | Level: ${level} | Points: ${points} ===`);

            const balances = await fetchUserBalance(wallet.address, proxy);
            const balance = parseInt(balances[0]?.balanceRaw, 10) / decimal || 0;
            log.info(`=== Address: ${wallet.address} | wstETH Balance : ${balance} ===\n`);

            if (balance > 0.02) {
                log.info(`Starting Perform Transactions for address: ${wallet.address}`);
                await performTransactions(wallet.privateKey, 0);
                await performTransactions(wallet.privateKey, 1);

                log.info('Cooldowns 10 seconds before continuing...\n');
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                log.info(`=== Not Enough wstETH, Trying to Claim Faucet ===`);
                const faucet = await getFaucet(wallet.address, proxy);
                await new Promise(resolve => setTimeout(resolve, 15000));

                if (faucet === 'success') {
                    log.info(`Starting Perform Transactions for address: ${wallet.address}`);
                    await performTransactions(wallet.privateKey, 0);
                    await performTransactions(wallet.privateKey, 1);
                    log.info('Cooldowns 10 seconds before continuing...\n');
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
            index++;
        } catch (err) {
            console.error(err);
        }
    }
    log.warn(`This script will run every 24 hours so don't close it.\n`);
};

setInterval(main, 24 * 60 * 60 * 1000); // Run every 24 hours
main();
