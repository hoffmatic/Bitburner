/** @param {NS} ns **/
export async function main(ns) {
	// Parameters
	// param 1: Server you want to hack
	// param 2: OPTIONAL - Server you want to start the hack from, i.e. any public servers, purchased servers or 'home'
	//
	// EXAMPLE 1: run masterHack.js joesguns
	// This will start hacking 'joesguns' using the RAM of 'joesguns'
	//
	// EXAMPLE 2: run masterHack.js joesguns s1
	// This will start hacking 'joesguns' using the RAM of my purchased server 's1'
	//
	// This 'masterHack.js' process will stay active on whatever server you execute it from.
	// I usually start it from 'home', then I can track all my earnings in one place.
	// Keep in mind, when using 'home' as second parameter the script might use all available RAM
	// and you might become unable to execute any other scripts on 'home' until you kill the process.

	var target = ns.args[0];
	var serverToHackFrom = target; // For single argument calls - server will hack itself
	var hackScript = "hack.js";
	var growScript = "grow.js";
	var weakenScript = "weaken.js";
	var growScriptRAM = ns.getScriptRam(growScript);
	var serverMaxMoney = ns.getServerMaxMoney(target);
	var serverMaxRAM;
	var moneyThresh = serverMaxMoney * 0.9; // 0.90 to maintain near 100% server money.  You can use 0.75 when starting out/using low thread counts
	var securityThresh = ns.getServerMinSecurityLevel(target) + 5;
	var currentServerMoney, currentServerSecurity;
	var useThreadsHack, useThreadsWeaken1, useThreadsWeaken2, useThreadsGrow, possibleThreads;
	var maxHackFactor = 0.01;
	var growWeakenRatio = 0.9; // How many threads are used for growing vs. weaking (90:10).
	var sleepTime, sleepTimeHack, sleepTimeGrow, sleepTimeWeaken;
	var sleepDelay = 200; // Sleep delay should range between 20ms and 200ms as per the documentation. I'll keep the default at 200, adjust as needed. 
	var i, batches, batchSize;

	// If second argument is provided, hack will run from this server instead
	if (ns.args[1]) {
		serverToHackFrom = ns.args[1];
	}
	serverMaxRAM = ns.getServerMaxRam(serverToHackFrom);

	// Use max of 4 batches up to 4 TB server size. Min batchSize is 256 GB.
	if (serverMaxRAM < 4096) {
		batchSize = Math.max(serverMaxRAM / 4, 256);
	} else {
		batchSize = 512;
	}

	// Gain root access. Make sure you have the nuke.js script on 'home'
	if (!ns.hasRootAccess(target)) {
		ns.exec("nuke.js", "home", 1, target);
		await ns.sleep(1000);
	}

	// Copy the work scripts, if not already on server
	if (!ns.fileExists(hackScript, serverToHackFrom)) {
		await ns.scp(hackScript, "home", serverToHackFrom);
	}
	if (!ns.fileExists(growScript, serverToHackFrom)) {
		await ns.scp(growScript, "home", serverToHackFrom);
	}
	if (!ns.fileExists(weakenScript, serverToHackFrom)) {
		await ns.scp(weakenScript, "home", serverToHackFrom);
	}

	// To prevent the script from crashing/terminating after closing and restarting the game.
	while (ns.isRunning(hackScript, serverToHackFrom, target) || ns.isRunning(growScript, serverToHackFrom, target) || ns.isRunning(weakenScript, serverToHackFrom, target)) {
		await ns.sleep(10000);
	}

	// Main loop - will terminate if no RAM available
	while (3 < (possibleThreads = Math.floor((serverMaxRAM - ns.getServerUsedRam(serverToHackFrom)) / growScriptRAM))) {
		currentServerMoney = ns.getServerMoneyAvailable(target);
		currentServerSecurity = ns.getServerSecurityLevel(target);
		sleepTimeHack = ns.getHackTime(target);
		sleepTimeGrow = ns.getGrowTime(target);
		sleepTimeWeaken = ns.getWeakenTime(target);
		// The first to cases are for new servers with high SECURITY LEVELS and to quickly grow the server to above the threshold
		if (currentServerSecurity > securityThresh) {
			ns.exec(growScript, serverToHackFrom, Math.ceil(possibleThreads / 2), target, 0);
			ns.exec(weakenScript, serverToHackFrom, Math.floor(possibleThreads / 2), target, 0);
			await ns.sleep(sleepTimeWeaken + sleepDelay); // wait for the weaken command to finish
		} else if (currentServerMoney < moneyThresh) {
			ns.exec(growScript, serverToHackFrom, Math.floor(possibleThreads * growWeakenRatio), target, 0);
			ns.exec(weakenScript, serverToHackFrom, Math.ceil(possibleThreads * (1 - growWeakenRatio)), target, 0);
			await ns.sleep(sleepTimeWeaken + sleepDelay); // wait for the weaken command to finish
		} else {
			// Define max amount that can be restored with one grow and therefore will be used to define hack threads.
			// The max grow threads are considering the weaken threads needed to weaken hack security and the weaken threads needed to weaken grow security.
			// I didn't bother optimizing the 'growWeakenRatio' further, as 90% is good enough already. It will be just a few more hack threads, if any at all - even with large RAM sizes.
			batches = Math.max(Math.floor((sleepTimeHack) / (3 * sleepDelay)), 1); // This way at least 1 batch will run
			batches = Math.min(batches, Math.ceil(serverMaxRAM / batchSize)); // Use just as many batches as batchSize allows
			possibleThreads = Math.floor(possibleThreads / batches);
			while (maxHackFactor < 0.999 &&
				Math.floor((possibleThreads - (useThreadsHack = Math.floor(ns.hackAnalyzeThreads(target, currentServerMoney * maxHackFactor))) - Math.ceil(useThreadsHack / 25)) * growWeakenRatio)
				> Math.ceil(ns.growthAnalyze(target, serverMaxMoney / (serverMaxMoney * (1 - maxHackFactor))))) {
				maxHackFactor += 0.001; // increase by 0.1% with each iteration
			}
			maxHackFactor -= 0.001; // Since it's more than 'possibleThreads' can handle now, we need to dial it back once.
			useThreadsHack = Math.max(Math.floor(ns.hackAnalyzeThreads(target, currentServerMoney * maxHackFactor)), 1); // Forgot this in the first version.
			useThreadsWeaken1 = Math.ceil(useThreadsHack / 25); // You can weaken the security of 25 hack threads with 1 weaken thread
			useThreadsGrow = Math.floor((possibleThreads - useThreadsWeaken1 - useThreadsHack) * growWeakenRatio);
			useThreadsWeaken2 = possibleThreads - useThreadsHack - useThreadsGrow - useThreadsWeaken1;
			for (i = 0; i < batches; i++) {
				ns.exec(weakenScript, serverToHackFrom, useThreadsWeaken1, target, 0, 0 + 2 * i);
				sleepTime = 2 * sleepDelay;
				ns.exec(weakenScript, serverToHackFrom, useThreadsWeaken2, target, sleepTime, 1 + 2 * i); // Second weaken script runs after the first
				sleepTime = sleepTimeWeaken - sleepTimeGrow + sleepDelay;
				ns.exec(growScript, serverToHackFrom, useThreadsGrow, target, sleepTime, i); // Grow script ends before second weaken script
				sleepTime = sleepTimeWeaken - sleepTimeHack - sleepDelay;
				ns.exec(hackScript, serverToHackFrom, useThreadsHack, target, sleepTime, i); // Hack script ends before first weaken script
				await ns.sleep(3 * sleepDelay);
			}
			await ns.sleep(sleepTimeWeaken);
			maxHackFactor = 0.01;
		}
	}
	ns.tprint("Script was terminated. Not enough RAM available on '" + serverToHackFrom + "'.")
}
