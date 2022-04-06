"use strict";
(function(){
	var variables = [];
	var functions = [];
	var file = "[anonymous]";


	function executeCommand(args, std) {
		console.log(args, std);
	}

	function astSequence() {
		let commands = [];
		return {
			add: c => commands.push(c),
			execute: (std) => commands.forEach(c => c.execute(std)),
		}
	}

	function astCommand() {
		let args = [];
		return {
			add: a => args.push(a),
			execute: (std) => {
				let evaluatedArgs = args.map(a => a.evaluate());
				executeCommand(evaluatedArgs, std);
			},
		};
	}

	function astValueCompound() {
		let components = [];
		return {
			add: c => components.push(c),
			evaluate: () => components.map(c => c.evaluate()).join(""),
		};
	}

	function astValueString(str) {
		return {
			evaluate: () => str,
		};
	}

	function astValueVar(name) {
		return {
			// add support for multiple arguments in one variable
			evaluate: () => variables[name],
		}
	}

	function astValueCommandSubstitution(ast) {
		return {
			evaluate: () => {
				// TODO
			},
		};
	}

	function astValueProcessSubstitution(ast) {
		return {
			evaluate: () => {
				// TODO
			},
		};
	}

	function panic(line, message) {
		throw `${file}: line ${line}: panic: ${message}`;
	}

	function syntaxError(line, message) {
		throw `${file}: line ${line}: syntax error: ${message}`;
	}

	function parseCommands(content) {
		let line = 1;

		const PS_INIT    = 0;
		const PS_COMMENT = -1;
		const PS_COMMAND = 1;

		let astRoot = astSequence();
		let current = null;

		let state = PS_INIT;
		let buffer = "";

		const length = content.length;
		for (let i = 0; i < length; i++) {
			const c = content[i];
			switch(state) {
				case PS_INIT:
					if (['\n', '\r', ' ', '\t', ';'].includes(c)) {
						// continue
					} else if (c == '#') {
						state = PS_COMMENT;
					} else {
						current = astCommand();
						buffer = c;
						state = PS_COMMAND;
					}
					break;
				case PS_COMMENT:
					if (c == '\n') {
						state = PS_INIT;
					}
					break;
				case PS_COMMAND:
					// check for escape and quotes
					if (c == ';' || c == '\n') {
						if (buffer) {
							current.add(astValueString(buffer));
							buffer = "";
						}
						astRoot.add(current);
						current = null;
						state = PS_INIT;
					} else if (c == ' ' || c == '\t') {
						if (buffer) {
							current.add(astValueString(buffer));
							buffer = "";
						}
					} else {
						buffer += c;
					}
					break;
				default:
					panic(line, "unknown parse state");
					break;
			}
			if (c == '\n') {
				line++;
			}
		}

		return astRoot;
	}

	window.sh = {
		parse: parseCommands,
	};
})();
