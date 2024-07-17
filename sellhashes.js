/** @param {NS} ns */
export async function main(ns) {
	ns.exploit();
	while (true){
		ns.hacknet.spendHashes ("Sell for Money");
		await ns.sleep(10);
	}
}
