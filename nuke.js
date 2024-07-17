/** @param {NS} ns */
export async function main(ns) {
	let target = ns.args[0];

	//const target = ["n00dles", "foodnstuff", "sigma-cosmetics", "joesguns", "hong-fang-tea", "harakiri-sushi", "iron-gym", "darkweb", "zer0", "CSEC", "nectar-net", "max-hardware", "neo-net", "silver-helix", "phantasy", "omega-net", "computek", "netlink", "johnson-ortho", "the-hub", "crush-fitness", "avmnite-02h", "catalyst", "I.I.I.I", "summit-uni", "syscore", "rothman-uni", "zb-institute", "lexo-corp", "rho-construction", "millenium-fitness", "alpha-ent", "aevum-police", "aerocorp", "snap-fitness", "galactic-cyber", "global-pharm", "omnia", "deltaone", "unitalife", "solaris", "defcomm", "icarus", "univ-energy", "zeus-med", "taiyang-digital", "zb-def", "infocomm", "nova-med", "titan-labs", "applied-energetics", "microdyne", "run4theh111z", "stormtech", "helios", "vitalife", "fulcrumtech", "4sigma", "kuai-gong" ,".", "omnitek", "b-and-a", "powerhouse-fitness", "nwo", "clarkinc", "blade", "ecorp", "megacorp", "fulcrumassets", "The-Cave"];

	if (ns.fileExists("BruteSSH.exe", "home")) {
		ns.brutessh(target);
	}

	if (ns.fileExists("FTPCrack.exe", "home")) {
		ns.ftpcrack(target);
	}

	if (ns.fileExists("relaySMTP.exe", "home")) {
		ns.relaysmtp(target);
	}

	if (ns.fileExists("HTTPWorm.exe", "home")) {
		ns.httpworm(target);
	}

	if (ns.fileExists("SQLInject.exe", "home")) {
		ns.sqlinject(target);
	}

	ns.nuke(target);

	const files = ["hack.js", "grow.js", "weaken.js", "masterHack.js", "nuke.js", "stocks.js", "autobuyhacknet.js", "autobuyhacknet.js"];


	ns.scp(files, target, "home");
	
	const masterhack = "masterHack.js";
	//ns.exec(masterhack, target, 1, target);


	ns.tprint("Nuke complete on " + target + ".");
}
