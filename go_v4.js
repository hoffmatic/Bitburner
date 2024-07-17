/** @param {NS} ns */
export async function main(ns, go = ns.go) {

  ns.disableLog('sleep');
  ns.disableLog('run');
  ns.clearLog();
  ns.tail();

  const yellow = "\u001b[33m", green = "\u001b[32m", red = "\u001b[31m";

  const OptionsFile = new FileHandler(ns, "go/options.txt");
  let Options = {
    monkeySee: false,         // Enables manual control
    playForever: true,        // Starts new games automatically instead of asking
    autoCheatSucMin: 1,       // Minimum success chance to allow auto to cheat nb: 0.8 = 80%
    rotateVs: true,           // Goes through supported opponents while playForever is enabled
    stuckOn5V5: true,         // Forces length 5 boards while playForever is enabled
    debuging: false,          // Enables a bunch of debuggers
    onStartup: {              // Options that can only be manually changed while script is inactive
      allowCheats: false,       // Enables use of go/cheat.js
      deleteOldBoards: false,   // Enables the pruning code early, changes to false after loading
      w: 0,                     // A counter to enable the pruning code, gets reset to 0 when it does
      usingGVM: true            // Enables use of analyze.getValidMoves(). If disabled, 
      //                           requires editing of script to reduce RAM
    }
  }
  try {
    Options = OptionsFile.read();
    if (ns.args[0]) { Options.monkeySee = ns.args[0]; }
    else { Options.monkeySee = false; }  // Disable manual control
    if (ns.args[1]) { Options.playForever = ns.args[1]; }
    else { Options.playForever = true; } // Set to Start new games automatically
    OptionsFile.write(Options);
  } catch { OptionsFile.write(Options); }
  const boardHistoryFile = new FileHandler(ns, "go/boardHistory.txt");
  try { boardHistoryFile.read() } catch { ns.print(`${yellow}No Info detected!`); boardHistoryFile.write({}); }
  const boardHistory = boardHistoryFile.read();
  const enums = {
    name2Num: {
      "No AI": 0, "Netburners": 1, "Slum Snakes": 2, "The Black Hand": 3,
      "Tetrads": 4, "Daedalus": 5, "Illuminati": 6, "????????????": 7
    },
    num2Name: {
      0: "No AI", 1: "Netburners", 2: "Slum Snakes", 3: "The Black Hand",
      4: "Tetrads", 5: "Daedalus", 6: "Illuminati", 7: "????????????"
    },
    order: ["No AI", "Netburners", "Slum Snakes", "The Black Hand",
      "Tetrads", "Daedalus", "Illuminati", "????????????"],
  };


  let movesMade = [{ boardName: '', moveMade: '', cheatInfo: {} }];
  let testBoard = go.getBoardState();
  let vs = go.getOpponent(), vsNum = enums.name2Num[vs];
  let boardName = `String`; boardName = boardNameTranslate(go.resetBoardState(vs, testBoard.length));
  let result = { type: "invalid", x: -1, y: -1 };
  let [newMsgGiven, playAgain, unseenBoard, monkeyDo, weWon] = [false, false, false, false, false];

  const usingGVM = Options.onStartup.usingGVM;
  const allowCheats = Options.onStartup.allowCheats;
  let deleteOldBoards = Options.onStartup.deleteOldBoards;
  let w = Options.onStartup.w;


  Options.onStartup.deleteOldBoards = false;
  OptionsFile.write(Options);
  if (enums.order.includes(vs)) { while (enums.order[0] !== vs) { enums.order.push(enums.order.shift()); } }

  do {
    let lastCheatChance = 1;
    movesMade = [];
    weWon = false;
    if (Options.playForever) {
      let log = ns.getScriptLogs();
      log.pop(); log.pop();
      log = log.pop();
      if (log && log.includes(`${vs}: `)) {
        const foeScore =
          eval(log.slice(log.lastIndexOf(`${vs}: `) + `${vs}: `.length, log.lastIndexOf(`,  Player: `)));
        const ourScore =
          eval(log.slice(log.lastIndexOf(`,  Player: `) + `,  Player: `.length));
        if (OptionsFile.read().rotateVs && ourScore > foeScore) {
          enums.order.push(enums.order.shift());
          while (["No AI", "????????????"].includes(enums.order[0])) {
            enums.order.push(enums.order.shift());
          }
        }
      }
      if (!Options.stuckOn5V5) { go.resetBoardState(enums.order[0], go.getBoardState().length); }
      else { go.resetBoardState(enums.order[0], 5); }
    }
    else if (playAgain) {
      let newBoard = await ns.prompt("Same same?");
      if (newBoard) { go.resetBoardState(vs, go.getBoardState().length); }
      else {
        while (!newBoard) {
          let newVS, newLength;
          while (!newVS) {
            newVS = await ns.prompt("Who we fighting?",
              { type: "select", choices: Object.keys(enums.name2Num) });
          }
          if (newVS === "????????????") { newLength = 19; }
          else if (Options.stuckOn5V5) { newLength = 5; }
          while (!newLength) {
            newLength = await ns.prompt("How big?",
              { type: "select", choices: [5, 7, 9, 13] });
          }
          newBoard = go.resetBoardState(newVS, newLength);
        }
      }
      playAgain = false;
    }

    Options = OptionsFile.read();
    Options.onStartup.w = w;
    OptionsFile.write(Options);

    vs = go.getOpponent();
    vsNum = enums.name2Num[vs];
    do {
      let monkeyLie = false;
      monkeyDo = true;
      newMsgGiven = false;
      unseenBoard = false;
      testBoard = go.getBoardState();
      boardName = boardNameTranslate(testBoard);

      const moveEntries = [];
      //  const last10Moves = []; last10Moves.length = 10;
      let ourNode = 0, foeNode = 0;
      {
        let x = 0, y = 0;
        for (const coloumString of testBoard) {
          y = 0;
          for (const node of coloumString) {
            if (node === ".") {
              let loopProtected = false;
              if (Options.debuging) { debugger; }
              for (const move of movesMade) {
                if (JSON.stringify({ boardName: boardName, moveMade: moveNameTranslate(`[${x},${y}]`) }) ==
                  JSON.stringify(move)) { loopProtected = true; }
              }
              if (!loopProtected) {
                if (usingGVM) {
                  if (go.analysis.getValidMoves()[x][y]) { moveEntries.push([`[${x},${y}]`, { r: 0, v: 0 }]); }
                }
                else { moveEntries.push([`[${x},${y}]`, { r: 0, v: 0 }]); }
              }
            }
            else if (node === "X") { ourNode++; } else if (node === "O") { foeNode++; }
            y++
          }
          x++
        }
        if (allowCheats) { moveEntries.push(["cheat", { r: 0, v: 0 }], ["pass", { r: 0, v: 0 }]); }
        else { moveEntries.push(["pass", { r: 0, v: 0 }]); }
      }

      {
        const diamiter = testBoard.length;
        const temp = [``.padEnd(diamiter + 2, "W")];
        for (let coloum of testBoard) {
          const pieces = coloum.split("");
          pieces.push("W"); pieces.unshift("W");
          temp.push(pieces.join(""));
        }
        temp.push(``.padEnd(diamiter + 2, "W"));
        testBoard = temp;
        if (Options.debuging) { debugger; }
      }

      if (enums.name2Num[vs] === undefined) {
        if (!newMsgGiven) { ns.print(`${yellow}New Opponent detected!`); }
        for (const opponent of Object.entries(enums.name2Num)) {
          ns.print(opponent);
        }
        ns.tail();
        let newVSNumber = await ns.prompt(
          `Please look at log and select an appropriate difficulty level to assign to ${vs}`, { type: "text" });
        while (!(isFinite(newVSNumber) && !enums.num2Name[newVSNumber])) {
          for (const opponent of Object.entries(enums.name2Num)) {
            ns.print(opponent);
          }
          ns.print(`${newVSNumber} is not a valid number!`);
          ns.tail();
          newVSNumber = await ns.prompt(
            `Please look at log and select an appropriate difficulty level to assign to ${vs}`, { type: "text" });
        }
        enums.name2Num[vs] = newVSNumber;
        enums.num2Name[newVSNumber] = vs;
        vsNum = newVSNumber;
        ns.print(`The variable named "enums" within go/v3.js will require editing for ${vs
          } to be included within auto-farm`);
      }
      if (!boardHistory[boardName]) {
        if (!newMsgGiven) { ns.print(`${yellow}New BoardState detected!`); newMsgGiven = true; }
        unseenBoard = true;
        boardHistory[boardName] = {};
        if (ourNode >= testBoard.length - 2 && foeNode <= 0) { boardHistory[boardName].p = { r: 1, v: 0 }; }
      }
      for (const moveEntry of moveEntries) {
        if (boardHistory[boardName][moveNameTranslate(moveEntry[0])]) {
          const info = boardHistory[boardName][moveNameTranslate(moveEntry[0])];
          if (moveEntry[0] !== "cheat") {
            moveEntry[1] = { r: info.r, v: info.v, score: moveScore(moveEntry[0], testBoard) };
          }
          else { // if move is a cheat
            if (Options.debuging) { debugger; }
            let avgR = 0, avgV = 0, i = 0;
            for (const cheatMoveType of Object.values(info)) {
              for (const cheatMove of Object.values(cheatMoveType)) {
                avgR += cheatMove.r; avgV += cheatMove.v; i++;
              }
            }
            moveEntry[1] = { r: avgR, v: avgV, score: moveScore(moveEntry[0], testBoard) }
          }
        }
        else { // if move has no history
          moveEntry[1] = { r: 0, v: 0, score: moveScore(moveEntry[0], testBoard) };
        }
      }

      //  [0] = "[x,y]" || "pass" || "cheat"; 
      //  [1] = { r(ratio): number, v(vNum): number, score: number };

      if (Options.monkeySee && monkeyDo) {
        const temp = [];
        for (const moveEntry of moveEntries) {
          temp.push(moveEntry);
        }
        temp.sort((a, b) => sortArray(a, b, vsNum));
        if (temp[0][1].r <= 0) {
          monkeyDo = false; monkeyLie = true;
          if (!newMsgGiven) { ns.print(`No positive Win Ratio, turning on manual`); }
        }
      }

      if (!unseenBoard || (!Options.monkeySee || monkeyDo)) {
        moveEntries.sort((a, b) => sortArray(a, b, vsNum));
      }

      do {
        result.type = "invalid";
        const cheatInfo = { what: "ActionNameShort", sucChance: 0.00, node: "[x,y,w,z]", success: false }
        cheatInfo.what = "stop cheating";
        const movesRecordedAtStart = movesMade.length;
        const center = moveNameTranslate(
          `[${Math.trunc(go.getBoardState().length / 2)},${Math.trunc(go.getBoardState().length / 2)}]`);
        if (ourNode <= 0 && foeNode <= 0 && (
          !boardHistory[boardName][center] || boardHistory[boardName][center].r >= 0
        )) {
          if (monkeyLie) {
            const logs = ns.getScriptLogs();
            logs.pop(); ns.clearLog();
            for (const log of logs) { ns.print(log); }
          }
          let [x, y] = JSON.parse(moveNameTranslate(center, false));
          try {
            result = await go.makeMove(x, y);
            movesMade.push({ "boardName": boardName, moveMade: center });
          } catch { result.type = "invalid"; }
        }
        else if (ourNode >= testBoard.length - 2 && foeNode <= 0) {
          if (allowCheats) {
            const motherPort = ns.pid;
            const deadNodes = [];
            let x, y; x = -1;
            for (const coloumString of testBoard) {
              y = -1;
              for (const node of coloumString) {
                if (node === "#") {
                  deadNodes.push({
                    node: `[${x},${y}]`,
                    r: 0, v: 0,
                    score: moveScore(`[${x},${y}]`, testBoard)
                  });
                }
                y++;
              }
              x++;
            }
            if (deadNodes.length > 0) {
              if (deadNodes.length > 1) {
                deadNodes.sort((a, b) => sortArray([, a], [, b], vsNum)); deadNodes.reverse();
              }
              let request = { what: "success", xy: [-1, -1] };
              ns.writePort(motherPort, request);
              let childPort = ns.run("go/cheat.js", { temporary: true }, motherPort);
              ns.print(`Repair Cheat initalizing`);
              if (!childPort) {
                ns.print(`${yellow}... Waiting for space ...`);
                while (!childPort) {
                  await ns.sleep();
                  childPort = ns.run("go/cheat.js", { temporary: true }, motherPort);
                }
              }
              if (ns.peek(childPort) === "NULL PORT DATA") { await ns.nextPortWrite(childPort); }
              const sucChance = ns.readPort(childPort);
              cheatInfo.sucChance = sucChance;
              lastCheatChance = sucChance;
              ns.print(`Success chance of repair: ${ns.formatPercent(sucChance)}`);
              request = { what: "repair", xy: JSON.parse(deadNodes[0].node) }
              cheatInfo.what = moveNameTranslate(request.what);
              cheatInfo.node = moveNameTranslate(JSON.stringify(request.xy));
              ns.writePort(motherPort, request);
              await ns.nextPortWrite(childPort);
              result = ns.readPort(childPort);
              cheatInfo.success = result.success;
              if (result.logs) { for (const log of result.logs) { ns.print(log); } }
              ns.writePort(motherPort, { what: "stop cheating" });
            }
          }
          if (boardName === boardNameTranslate(go.getBoardState())) {
            try {
              result = await go.passTurn();
              movesMade.push({ "boardName": boardName, moveMade: "p" });
            } catch { result.type = "invalid"; }
          }
        }
        else {
          if (!Options.monkeySee || monkeyDo) {
            do {
              if (!moveEntries[0] || (false && unseenBoard && movesMade.length > 10)) {
                try {
                  moveEntries.unshift(["pass"]);
                  result = await go.passTurn();
                } catch { result.type = "invalid"; }
                if (movesMade.length > 0 && result.type !== "gameOver"
                  && movesMade[movesMade.length - 1].moveMade === "p") {
                  if (boardHistory[boardName].p) {
                    boardHistory[boardName].p.r = -0.1;
                    if (boardHistory[boardName].p.v === 0) {
                      boardHistory[boardName].p.v = 0.1;
                    }
                  }
                  else { boardHistory[boardName].p = { r: -0.1, v: 0.1 }; }
                  movesMade = []; result = { type: "gameOver", x: null, y: null };
                }
              }
              else if (moveEntries[0][0] === "pass") {
                try { result = await go.passTurn(); }
                catch { result.type = "invalid"; }
              }
              else if (moveEntries[0][0] === "cheat") {
                const motherPort = ns.pid;
                let request = { what: "success", xy: [-1, -1] };
                ns.writePort(motherPort, request);
                let childPort = ns.run("go/cheat.js", { temporary: true }, motherPort);
                ns.print(`${yellow}Cheats initalizing`);
                if (!childPort) {
                  ns.print(`${yellow}... Waiting for space ...`);
                  while (!childPort) {
                    await ns.sleep();
                    childPort = ns.run("go/cheat.js", { temporary: true }, motherPort);
                  }
                }
                if (ns.peek(childPort) === "NULL PORT DATA") { await ns.nextPortWrite(childPort); }
                const sucChance = ns.readPort(childPort);
                cheatInfo.sucChance = sucChance;
                lastCheatChance = sucChance;
                ns.print(`Success chance of cheating: ${ns.formatPercent(sucChance)}`);
                if (lastCheatChance >= Options.autoCheatSucMin) {
                  const emptyNodes = [], deadNodes = [], occupiedNodes = [];
                  let x, y; x = -1;
                  for (const coloumString of testBoard) {
                    y = -1;
                    for (const node of coloumString) {
                      if (node !== "W") {
                        if (node === ".") { emptyNodes.push(`[${x},${y}]`); }
                        else if (node === "#") { deadNodes.push(`[${x},${y}]`); }
                        else { occupiedNodes.push(`[${x},${y}]`); }
                      }
                      y++;
                    }
                    x++;
                  }

                  const cheats = [];
                  // Load in potential cheats
                  if (emptyNodes.length > 1) {
                    for (let i = 0; i < emptyNodes.length; ++i) {
                      for (let i2 = i + 1; i2 < emptyNodes.length; i2++) {
                        const pieces = [...JSON.parse(emptyNodes[i]), ...JSON.parse(emptyNodes[i2])];
                        cheats.push(["play", {
                          node: `[${pieces[0]},${pieces[1]},${pieces[2]},${pieces[3]}]`,
                          r: 0, v: 0,
                          score: moveScore({
                            type: "play",
                            node1: emptyNodes[i],
                            node2: emptyNodes[i2]
                          }, testBoard)
                        }]);
                      }
                    }
                  }
                  if (deadNodes.length > 0) {
                    for (const node of deadNodes) {
                      cheats.push(["repair", {
                        node: node,
                        r: 0, v: 0,
                        score: moveScore({ type: "repair", node: node }, testBoard)
                      }]);
                    }
                  }
                  if (emptyNodes.length > 0) {
                    for (const node of emptyNodes) {
                      cheats.push(["destroy", {
                        node: node,
                        r: 0, v: 0,
                        score: moveScore({ type: "destroy", node: node }, testBoard)
                      }]);
                    }
                  }
                  if (occupiedNodes.length > 0) {
                    for (const node of occupiedNodes) {
                      cheats.push(["remove", {
                        node: node,
                        r: 0, v: 0,
                        score: moveScore({ type: "remove", node: node }, testBoard)
                      }]);
                    }
                  }
                  // Load in history of past cheats
                  if (boardHistory[boardName].c) {
                    for (const cheat of cheats) {
                      let shortcut = boardHistory[boardName].c[cheat[0]];
                      if (shortcut && shortcut[moveNameTranslate(cheat[1].node)]) {
                        shortcut = shortcut[moveNameTranslate(cheat[1].node)];
                        cheat[1].r = shortcut.r;
                        cheat[1].v = shortcut.v;
                      }
                    }
                  }
                  cheats.sort((a, b) => sortArray(a, b, vsNum));

                  //  [0] = "play" || "repair" || "destory" || "remove"; 
                  //  [1] = { node: (`[x,y]` || `[x,y,w,z]`), r(ratio): number, v(vNum): number, score: 0 };

                  const cheatChoices = [];
                  if (occupiedNodes.length > 0) { cheatChoices.unshift("remove"); }
                  if (emptyNodes.length > 0) { cheatChoices.unshift("destroy"); }
                  if (deadNodes.length > 0) { cheatChoices.unshift("repair"); }
                  if (emptyNodes.length > 1) { cheatChoices.unshift("play"); }
                  while (cheats.length > 0 && !cheatChoices.includes(cheats[0][0])) { cheats.shift(); }
                  if (cheats.length === 0) {
                    request.what = "stop cheating";
                    ns.writePort(motherPort, request);
                    result.type = "invalid";
                    ns.print(`${yellow}Cheats deactivated: Could not find valid cheat`);
                  }
                  else {
                    request = { what: cheats[0][0], xy: JSON.parse(cheats[0][1].node) };
                    cheatInfo.what = moveNameTranslate(request.what);
                    cheatInfo.node = moveNameTranslate(cheats[0][1].node);
                    ns.writePort(motherPort, request);
                    await ns.nextPortWrite(childPort);
                    result = ns.readPort(childPort);
                    cheatInfo.success = result.success;
                    if (result.logs) { for (const log of result.logs) { ns.print(log); } }
                    ns.writePort(motherPort, { what: "stop cheating" });
                  }
                }
                else { // if (lastCheatChance < Options.autoCheatSucMin)
                  request.what = "stop cheating";
                  ns.writePort(motherPort, request);
                  ns.print(`${yellow}Cheats deactivated: Success chance below minimum`);
                  result.type = "invalid";
                }
              }
              else /*if a move*/ {
                let [x, y] = JSON.parse(moveEntries[0][0]);
                try { result = await go.makeMove(x, y); }
                catch { result.type = "invalid"; }
              }
              if (result.type === "invalid") { moveEntries.shift(); }
            } while (result.type === "invalid");
            movesMade.push({ "boardName": boardName, moveMade: moveNameTranslate(moveEntries[0][0]) });
          }
          else /* if (Options.monkeySee && !monkeyDo) */ {
            let playerChoice;
            let choices = ["Please Wait", "10 sec Plz"];
            for (const moveEntry of moveEntries) { choices.push(moveEntry[0]); }
            choices.push("restart");

            do {
              playerChoice = null;
              result.type = "invalid";

              while (!playerChoice) {
                playerChoice = await ns.prompt("Pick a move", { type: "select", choices: choices });
              }

              if (playerChoice === "Please Wait") {
                await ns.sleep(await ns.prompt("How long (in minutes)", { type: "text" }) * 60000);
                result.type = "invalid";
              }
              else if (playerChoice === "10 sec Plz") {
                await ns.sleep(10000); result.type = "invalid";
              }
              else if (playerChoice === "pass") {
                try { result = await go.passTurn(); }
                catch { result.type = "invalid"; }
              }
              else if (playerChoice === "cheat") {
                const motherPort = ns.pid;
                let request = { what: "success", xy: [-1, -1] };
                ns.writePort(motherPort, request);
                let childPort = ns.run("go/cheat.js", { temporary: true }, motherPort);
                ns.print(`${yellow}Cheats initalizing`);
                if (!childPort) {
                  ns.print(`${yellow}... Waiting for space ...`);
                  while (!childPort) {
                    await ns.sleep();
                    childPort = ns.run("go/cheat.js", { temporary: true }, motherPort);
                  }
                }
                if (ns.peek(childPort) === "NULL PORT DATA") { await ns.nextPortWrite(childPort); }
                const sucChance = ns.readPort(childPort);
                cheatInfo.sucChance = sucChance;
                lastCheatChance = sucChance;
                ns.print(`Success chance of cheating: ${ns.formatPercent(sucChance)}`);
                const emptyNodes = [], deadNodes = [], occupiedNodes = [];
                let x, y; x = -1;
                for (const coloumString of testBoard) {
                  y = -1;
                  for (const node of coloumString) {
                    if (node !== "W") {
                      if (node === ".") { emptyNodes.push(`[${x},${y}]`); }
                      else if (node === "#") { deadNodes.push(`[${x},${y}]`); }
                      else { occupiedNodes.push(`[${x},${y}]`); }
                    }
                    y++;
                  }
                  x++;
                }
                const cheatChoices = ["stop cheating"];
                if (occupiedNodes.length > 0) { cheatChoices.unshift("remove"); }
                if (emptyNodes.length > 0) { cheatChoices.unshift("destroy"); }
                if (deadNodes.length > 0) { cheatChoices.unshift("repair"); }
                if (emptyNodes.length > 1) { cheatChoices.unshift("play"); }
                let selectedCheat =
                  await ns.prompt(`Success chance: ${ns.formatPercent(sucChance)}, what cheat?`,
                    { type: "select", choices: cheatChoices });
                if (!selectedCheat) { selectedCheat = "stop cheating"; }
                request.what = selectedCheat;
                if (selectedCheat === "stop cheating") {
                  ns.writePort(motherPort, request);
                  ns.print(`${yellow}Cheats deactivated`);
                  result.type = "invalid";
                }
                else {
                  cheatInfo.what = moveNameTranslate(selectedCheat);
                  ns.print(`${yellow}Selecting cheat target(s)`);
                  if (selectedCheat === "play") {
                    let node1, node2;
                    while (!node1 || !node2 || node1 === node2) {
                      node1 =
                        await ns.prompt("First node to place?", { type: "select", choices: emptyNodes });
                      node2 =
                        await ns.prompt(`First node: ${node1}, 2nd?`, { type: "select", choices: emptyNodes });
                    }
                    if (Options.debuging) { debugger; }
                    node1 = JSON.parse(node1); node2 = JSON.parse(node2);
                    request.xy = [...node1, ...node2];
                    cheatInfo.node = moveNameTranslate(JSON.stringify(request.xy));
                  }
                  else if (selectedCheat === "repair") {
                    let node =
                      await ns.prompt("Repair what node?", { type: "select", choices: deadNodes });
                    while (!node) {
                      node = await ns.prompt("Repair what node?", { type: "select", choices: deadNodes });
                    }
                    request.xy = JSON.parse(node);
                    cheatInfo.node = moveNameTranslate(node);
                  }
                  else if (selectedCheat === "remove") {
                    let node =
                      await ns.prompt("Remove what node?", { type: "select", choices: occupiedNodes });
                    while (!node) {
                      node = await ns.prompt("Remove what node?", { type: "select", choices: occupiedNodes });
                    }
                    request.xy = JSON.parse(node);
                    cheatInfo.node = moveNameTranslate(node);
                  }
                  else if (selectedCheat === "destroy") {
                    let node =
                      await ns.prompt("Destroy what node?", { type: "select", choices: emptyNodes });
                    while (!node) {
                      node = await ns.prompt("Destroy what node?", { type: "select", choices: emptyNodes });
                    }
                    request.xy = JSON.parse(node);
                    cheatInfo.node = moveNameTranslate(node);
                  }
                  ns.writePort(motherPort, request);
                  await ns.nextPortWrite(childPort);
                  result = ns.readPort(childPort);
                  cheatInfo.success = result.success;
                  if (result.logs) { for (const log of result.logs) { ns.print(log); } }
                  ns.writePort(motherPort, { what: "stop cheating" });
                }
              }
              else if (playerChoice === "restart") {
                let penalty;
                while (!isFinite(penalty) || penalty < 0) {
                  penalty = await ns.prompt(
                    `What penalty (if any) should be given? (suggested ${(testBoard.length - 2) / 10})`,
                    { type: "text" });
                }
                ns.print(`Restart requested... ${vs}: ${penalty},  Player: 0`);
                result = { type: "gameOver", x: null, y: null };
              }
              else if (playerChoice) {
                let [x, y] = JSON.parse(playerChoice);
                try { result = await go.makeMove(x, y); }
                catch { result.type = "invalid"; }
              }
              if (playerChoice && (playerChoice !== "Please Wait" && playerChoice !== "10 sec Plz" &&
                playerChoice !== "cheat") && result.type === "invalid") {
                choices.splice(choices.findIndex(x => x === playerChoice), 1);
              }
            } while (result.type === "invalid");
            movesMade.push({ "boardName": boardName, "moveMade": moveNameTranslate(playerChoice) });
          }
        }
        if (cheatInfo.what !== "stop cheating" && movesRecordedAtStart < movesMade.length) {
          movesMade[movesMade.length - 1].cheatInfo = cheatInfo;
        }
      } while (result.type === "invalid");

      {
        const logs = ns.getScriptLogs();
        const lastLog = logs[logs.length - 1];
        if (!lastLog.includes(`${vs}: `)) {
          await go.opponentNextTurn();
          const newLastLog = ns.getScriptLogs().pop();
          if (newLastLog.includes("You can end the game by passing as well.")) {
            const allTheLogs = newLastLog.split("You can end the game by passing as well.")
            ns.clearLog();
            logs.push(allTheLogs[0]);
            for (const log of logs) {
              ns.print(log);
            }
          }
        }
      }

      //  last10Moves.shift();
      //  last10Moves.push(movesMade[movesMade.length - 1][1]);

      if (result.type !== "gameOver" &&
        boardName === boardNameTranslate(go.getBoardState())) { await ns.sleep(); }
    } while (result.type !== "gameOver");

    if (movesMade.length > 1) {
      const log = ns.getScriptLogs().pop();
      if (log.includes(`${vs}: `)) {
        const foeScore =
          eval(log.slice(log.lastIndexOf(`${vs}: `) + `${vs}: `.length, log.lastIndexOf(`,  Player: `)));
        const ourScore =
          eval(log.slice(log.lastIndexOf(`,  Player: `) + `,  Player: `.length));
        if (isFinite(foeScore) && isFinite(ourScore)) {
          let i = 1, killMe = false, updatedScores = 0;
          for (const turn of movesMade) {
            if (Options.debuging) { debugger; }
            if (!boardHistory[turn.boardName][turn.moveMade]) {
              if (turn.moveMade === "c") { boardHistory[turn.boardName][turn.moveMade] = {} }
              else if (turn.moveMade !== "r") { boardHistory[turn.boardName][turn.moveMade] = { r: 0, v: 0 }; }
              else { i++; continue; }
            }
            const bHbNmM = boardHistory[turn.boardName][turn.moveMade];
            const newRatio = Math.round((ourScore - foeScore) * (i / movesMade.length) * 10000) / 10000;

            if (turn.moveMade === "c") {
              const cI = turn.cheatInfo;
              if (!bHbNmM[cI.what]) { bHbNmM[cI.what] = {}; }
              if (!bHbNmM[cI.what][cI.node]) {
                bHbNmM[cI.what][cI.node] = {
                  v: vsNum,
                  r: newRatio
                };
                updatedScores++; i++;
              }
              else { // If history for this move exists
                const short = bHbNmM[cI.what][cI.node];
                if (vsNum > short.v) {
                  short.v = vsNum;
                  short.r = Math.round(newRatio * 1000) / 1000;
                  updatedScores++; i++;
                }
                else if (vsNum == short.v) {
                  short.r = Math.round(((short.r * 0.5) + (newRatio * 0.5)) * 1000) / 1000;
                  updatedScores++; i++;
                }
                else if (vsNum < short.v) {
                  i++;
                }
                else { i++; killMe = true; }
              }
            }
            else { // if wasn't a cheatMove
              if (vsNum > bHbNmM.v) {
                bHbNmM.v = vsNum;
                bHbNmM.r = Math.round(newRatio * 1000) / 1000;;
                updatedScores++; i++;
              }
              else if (vsNum == bHbNmM.v) {
                bHbNmM.r = Math.round(((bHbNmM.r * 0.5) + (newRatio * 0.5)) * 1000) / 1000;
                updatedScores++; i++;
              }
              else if (vsNum < bHbNmM.v) {
                i++;
              }
              else { i++; killMe = true; }
            }
          }
          boardHistoryFile.write(boardHistory);
          if (ourScore > foeScore) {
            weWon = true;
            ns.print(`${green}${updatedScores}/${movesMade.length} Game Results Updated`);
          }
          else { ns.print(`${yellow}${updatedScores}/${movesMade.length} Game Results Updated`); }
          if (killMe) { ns.exit(); }
        }
        else { ns.print(`${red}Game Results Discarded`); }
        ns.print("---------------------------------------------------");
      }
      else {
        debugger;
        boardHistoryFile.write(boardHistory);
        ns.print(`${red}Game Results Not Found ${yellow}New Boards Saved`);
        ns.print("---------------------------------------------------");
      }

      if (!Options.playForever) { playAgain = await ns.prompt("Play another game?"); }
    }
    else {
      boardHistoryFile.write(boardHistory);
      ns.print(`${yellow}New Game+`);
      ns.print("---------------------------------------------------");
      playAgain = true;
    }

    if (deleteOldBoards ||
      ++w * w * w > Object.keys(boardHistory).length && weWon) {
      w = 0; deleteOldBoards = false;
      let [i, dBoards, dMoves] = [0, 0, 0];
      if (Object.keys(boardHistory).length <= 180000) {
        for (const board of Object.entries(boardHistory)) {
          if (Options.debuging) { debugger; }
          i++; let noGood = true;
          for (const move of Object.entries(board[1])) {
            if (move[0] !== "c") {
              if (move[1].r > 0) { noGood = false; }
              else { delete boardHistory[board[0]][move[0]]; dMoves++; }
            }
            else {
              for (const cheatMoveType of Object.entries(move[1])) {
                let typeNoGood = true;
                for (const cheatMove of Object.entries(cheatMoveType[1])) {
                  if (cheatMove[1].r > 0) { typeNoGood = false; }
                  else { delete boardHistory[board[0]][move[0]][cheatMoveType[0]][cheatMove[0]]; dMoves++; }
                }
                if (typeNoGood) {
                  delete boardHistory[board[0]][move[0]][cheatMoveType[0]];
                } else { noGood = false; }
              }
            }
          }
          if (noGood) { delete boardHistory[board[0]]; dBoards++; }
          if (i > 1e6) { i = 0; await ns.sleep(); }
        }
      }
      else { // if boardHistory is big
        for (const board of Object.entries(boardHistory)) {
          if (Options.debuging) { debugger; }
          i++; let noGood = true;
          let movesInBoard = 0;
          let best = { name: null, r: 0, v: 0 };
          let bestCheat = { type: null, name: null, r: 0, v: 0 }
          for (const move of Object.entries(board[1])) {
            if (move[0] !== "c") {
              movesInBoard++;
              if (move[1].v > best.v) {
                if (move[1].r > 0) {
                  noGood = false;
                  best = { name: move[0], r: move[1].r, v: move[1].v };
                }
              }
              else if (move[1].v == best.v) {
                if (move[1].r > best.r) {
                  best = { name: move[0], r: move[1].r, v: move[1].v };
                }
              }
            }
            else {
              for (const cheatMoveType of Object.entries(move[1])) {
                let typeNoGood = true;
                let movesInType = 0;
                for (const cheatMove of Object.entries(cheatMoveType[1])) {
                  movesInType++;
                  if (cheatMove[1].v > bestCheat.v) {
                    if (cheatMove[1].r > 0) {
                      typeNoGood = false;
                      best = { type: cheatMoveType[0], name: cheatMove[0], r: cheatMove[1].r, v: cheatMove[1].v };
                    }
                  }
                  else if (cheatMove[1].v == best.v) {
                    if (cheatMove[1].r > bestCheat.r) {
                      best = { type: cheatMoveType[0], name: cheatMove[0], r: cheatMove[1].r, v: cheatMove[1].v };
                    }
                  }
                }
                if (typeNoGood) {
                  delete boardHistory[board[0]][move[0]][cheatMoveType[0]];
                  dMoves += movesInType;
                } else { noGood = false; }
              }
            }
          }
          if (noGood) { delete boardHistory[board[0]]; dBoards++; dMoves += movesInBoard; }
          else {
            for (const move of Object.entries(board[1])) {
              if (move[0] !== "c") {
                if (move[0] != best.name) { delete boardHistory[board[0]][move[0]]; dMoves++; }
              }
              else {
                for (const cheatMoveType of Object.entries(move[1])) {
                  for (const cheatMove of Object.entries(cheatMoveType[1])) {
                    if (cheatMove[0] != bestCheat.name) {
                      delete boardHistory[board[0]][move[0]][cheatMoveType[0]][cheatMove[0]];
                    }
                  }
                }
              }
            }
          }
          if (i > 1e6) { i = 0; await ns.sleep(); }
        }
      }
      if (dMoves > 0 || dBoards > 0) {
        ns.print(`${yellow}Doing some cleaning...`);
        ns.print(`Deleted ${ns.formatNumber(dBoards, 0)} Boards and ${ns.formatNumber(dMoves, 0)} Moves`);
        ns.print("---------------------------------------------------");
      }
    }

  } while (Options.playForever || playAgain);
}

/** @param {NS} ns */
function moveScore(move, testBoard) {
  let score = 0;
  if (move.type || move === "c" || move === "cheat") {
    score = 50 * testBoard.length;
    if (move.type) {
      score += Math.random();
      if (move.type === "play") {
        score += 3 * testBoard.length + moveScore(move.node1, testBoard) + moveScore(move.node2, testBoard);
      }
      else if (move.type === "repair") { score += 2 * testBoard.length + moveScore(move.node, testBoard); }
      else if (move.type === "destroy") { score += 1 * testBoard.length + moveScore(move.node, testBoard); }
      else if (move.type === "remove") { score += 0 * testBoard.length + moveScore(move.node, testBoard); }
    }
    return score;
  }
  if (move === "p" || move === "pass") {
    return 10 * testBoard.length;
  }
  // Take in [x,y] position of the move and the boardState, return how much we like the move, bigger is better
  const [xActual, yActual] = JSON.parse(move);
  const testX = xActual + 1, testY = yActual + 1;
  score = Math.trunc(Math.random() * 100 * testBoard.length) + 1;
  // Stay away from the edges
  {
    const radius = Math.trunc((testBoard.length) / 2);
    for (const axis of [testX, testY]) {
      score *= (radius - Math.abs(axis - radius) + 0.5);
    }
  }
  // Prefer moves where x and y add to an even number
  {
    if ((xActual + yActual) / 2 == Math.trunc((xActual + yActual) / 2)) { score *= 2; }
  }
  // Friendly, or empty connections, excluding closing eyes
  {
    let emptyCon = 0, ourCon = 0, foeCon = 0, wallCon = 0, deadCon = 0;
    for (const nodeMod of [-1, 1]) {
      if (testBoard[testX + nodeMod][testY] == ".") { emptyCon++; }
      if (testBoard[testX][nodeMod + testY] == ".") { emptyCon++; }
      if (testBoard[testX + nodeMod][testY] == "X") { ourCon++; }
      if (testBoard[testX][nodeMod + testY] == "X") { ourCon++; }
      if (testBoard[testX + nodeMod][testY] == "O") { foeCon++; }
      if (testBoard[testX][nodeMod + testY] == "O") { foeCon++; }
      if (testBoard[testX + nodeMod][testY] == "W") { wallCon++; }
      if (testBoard[testX][nodeMod + testY] == "W") { wallCon++; }
      if (testBoard[testX + nodeMod][testY] == "#") { deadCon++; }
      if (testBoard[testX][nodeMod + testY] == "#") { deadCon++; }
    }
    if (foeCon + deadCon + wallCon == 4) { score *= 15; }
    if (ourCon + foeCon == 4) { score *= 1.01; }
    if (ourCon > 0 && ourCon + wallCon + deadCon < 3) { score *= 1.5; }
    if ((ourCon == 2 || ourCon == 1) && emptyCon == 2) { score *= 1.2; }
    if (emptyCon > 0) { score *= 1.1; }
    if (foeCon > 0) { score *= 1.1; }
    if (ourCon + deadCon + wallCon == 4) { score *= 0.01; }
    else if (ourCon > 2 && foeCon == 0) { score *= 0.9; }
  }
  return score;
}

/** @param {NS} ns */
function sortArray(A, B, vsNum) {
  const a = A[1], b = B[1], scores = !!a.score;
  if ((a.v >= vsNum && a.r >= 0) || (b.v >= vsNum && b.r >= 0)) {
    if ((a.v >= vsNum && a.r >= 0) && !(b.v >= vsNum && b.r >= 0)) { return -1; }
    if ((b.v >= vsNum && b.r >= 0) && !(a.v >= vsNum && a.r >= 0)) { return 1; }
  }
  if (a.r !== b.r) { return b.r - a.r; }
  return b.score - a.score;
}

/** @param {NS} ns */
function boardNameTranslate(name2Translate, array2String = true) {
  const result = [];
  if (!array2String) {
    const nameAsArray = JSON.parse(name2Translate);
    for (const coloumString of nameAsArray) {
      const newStringPieces = []
      const pieces = coloumString.split("");
      while (pieces.length > 0) {
        const nodeType = pieces.shift();
        if (!isFinite(pieces[0])) {
          newStringPieces.push(nodeType);
        }
        else {
          let i = pieces.shift();
          while (i > 0) {
            newStringPieces.push(nodeType); --i;
          }
        }
      }
      result.push("".concat(...newStringPieces));
    }
    return result;
  }
  else { // if (array2String)
    for (const coloumString of name2Translate) {
      const newStringPieces = []
      const pieces = coloumString.split("");
      while (pieces.length > 0) {
        const nodeType = pieces.shift();
        let consecutive = 1;
        while (nodeType === pieces[0]) {
          consecutive++;
          pieces.shift();
        }
        if (consecutive === 1) { newStringPieces.push(nodeType); }
        else { newStringPieces.push(`${nodeType}${consecutive}`); }
      }
      result.push("".concat(...newStringPieces));
    }
    return JSON.stringify(result);
  }
}

/** @param {NS} ns */
function moveNameTranslate(nameString2Translate, long2Short = true) {
  if (nameString2Translate == null) { return null; }
  if (!long2Short) {
    if (["c", "cheat"].includes(nameString2Translate)) { return "cheat"; }
    if (["p", "pass"].includes(nameString2Translate)) { return "pass"; }
    //  if (["r", "restart"].includes(nameString2Translate)) { return "restart"; }
    if (["t", "remove"].includes(nameString2Translate)) { return "remove"; }
    if (["d", "destroy"].includes(nameString2Translate)) { return "destroy"; }
    if (["f", "repair"].includes(nameString2Translate)) { return "repair"; }
    if (["2", "play"].includes(nameString2Translate)) { return "play"; }
    if (nameString2Translate.length === 2) {
      const pieces = nameString2Translate.split("");
      return `[${pieces[0]},${pieces[1]}]`;
    }
    else {
      const pieces = nameString2Translate.split(",");
      if (pieces.length === 2) { return `[${pieces[0]},${pieces[1]}]`; }
      else {
        return `[${pieces[0]},${pieces[1]},${pieces[2]},${pieces[3]}]`;
      }
    }
  }
  else { // if (long2Short)
    if (["cheat", "c"].includes(nameString2Translate)) { return "c"; }
    if (["pass", "p"].includes(nameString2Translate)) { return "p"; }
    if (["restart", "r"].includes(nameString2Translate)) { return "r"; }
    if (["remove", "t"].includes(nameString2Translate)) { return "t"; }
    if (["destroy", "d"].includes(nameString2Translate)) { return "d"; }
    if (["repair", "f"].includes(nameString2Translate)) { return "f"; }
    if (["play", "2"].includes(nameString2Translate)) { return "2"; }
    {
      const [x, y, w, z] = JSON.parse(nameString2Translate);
      if (!z) {
        if (x < 10 && y < 10) { return `${x}${y}`; }
        else { return `${x},${y}`; }
      }
      else { return `${x},${y},${w},${z}`; }
    }
  }
}

/** @param {NS} ns */
export class FileHandler {
  #file;
  #ns;

  constructor(ns, file) {
    this.#ns = ns;
    this.#file = file;
  }

  newFile(type = "blank") {
    if (type == "object") { this.#ns.write(this.#file, "{}", "w"); }
    else if (type == "array") { this.#ns.write(this.#file, "[]", "w"); }
    else { this.#ns.write(this.#file, "", "w"); }
  }

  write(data, mode = "w") {
    this.#ns.write(this.#file, JSON.stringify(data), mode);
  }

  read() {
    return JSON.parse(this.#ns.read(this.#file));
  }

  append(data, mode = "a") {
    this.#ns.write(this.#file, JSON.stringify(data), mode);
  }
}
