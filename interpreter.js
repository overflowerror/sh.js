"use strict";
(function(){
	var variables = [];
	var functions = [];
	var currentFile = "[anonymous]";

	const buildins = {
		echo: function(args, ctx) {
			const length = args.length;
			for (let i = 1; i < length; i++) {
				ctx.stdout.write(args[i]);
				if (i < length - 1) {
					ctx.stdout.write(" ");
				}
			}
			ctx.stdout.write("\n");
			ctx.stdout.flush();
			return 0;
		},
	};

	function executeCommand(args, ctx) {
		if (!ctx) {
			ctx = defaultCtx;
		}

		let errorCode = 255;

		if (buildins[args[0]]) {
			errorCode = buildins[args[0]](args, ctx);
		} else {
			console.debug(`command not found; args: ${args}, ctx: ${ctx}`);
		}

		console.debug("exit status: " + errorCode);
	}

	const file = {
		console: function() {
			let buffer = [];
			const self = {
				read: () => "",
				close: () => self.flush(),
				flush: () => {
					console.log(buffer);
					buffer = [];
				},
				write: (str) => {
					buffer += str;
				},
			};
			return self;
		}
	};

	function makeCtx(stdin, stdout, stderr) {
		return {
			stdin: stdin,
			stdout: stdout,
			stderr: stderr,
		}
	}

	const defaultCtx = makeCtx(file.console(), file.console(), file.console());

	const ast = {
		sequence: function() {
			let commands = [];
			return {
				add: c => commands.push(c),
				execute: (ctx) => commands.forEach(c => c.execute(ctx)),
				toString: () => "sequence {\n" + commands
					.map(c => c.toString())
					.map(s => s.split("\n"))
					.map(a => a.map(s => "  " + s))
					.map(a => a.join("\n"))
					.join(",\n") + "\n}",
			}
		},

		command: function() {
			let args = [];
			return {
				add: a => args.push(a),
				size: a => args.length,
				execute: (ctx) => {
					let evaluatedArgs = args.map(a => a.evaluate());
					executeCommand(evaluatedArgs, ctx);
				},
				toString: () => "command {\n" + args
					.map(a => a.toString())
					.map(s => s.split("\n"))
					.map(a => a.map(s => "  " + s))
					.map(a => a.join("\n"))
					.join(",\n") + "\n}",
			};
		},

		assignment: function(name) {
			let value = ast.value.string("");
			return {
				setValue: v => { value = v; },
				execute: (ctx) => {
					variables[name] = value.evaluate();
				},
				toString: () => `assign '${name}'=\n${value.toString().split('\n').map(l => "  " + l).join("\n")}`,
			};
		},

		value: {
			compound: function() {
				let components = [];
				const self = {
					add: c => components.push(c),
					evaluate: () => components.map(c => c.evaluate()).join(""),
					toString: () => "compound {\n" + components
						.map(a => a.toString())
						.map(s => s.split("\n"))
						.map(a => a.map(s => "  " + s))
						.map(a => a.join("\n"))
						.join(",\n") + "\n}",
					reduce: () => {
						if (components.length == 1) {
							if (components[0].reduce) {
								return components[0].reduce();
							} else {
								return components[0];
							}
						} else {
							return self;
						}
					},
				};
				return self;
			},

			string: function(str) {
				return {
					evaluate: () => str,
					toString: () => "'" + str + "'",
				};
			},

			variable: function(name) {
				return {
					// add support for multiple arguments in one variable
					evaluate: () => variables[name],
					toString: () => `var '${name}'`,
				}
			},

			commandSubstitution: function(ast) {
				return {
					evaluate: () => {
						// TODO
					},
					toString: () => "not implemented",
				};
			},

			processSubstitution: function(ast) {
				return {
					evaluate: () => {
						// TODO
					},
					toString: () => "not implemented",
				};
			},
		},
	}

	function panic(line, message) {
		throw `${currentFile}: line ${line}: panic: ${message}`;
	}

	function syntaxError(line, message) {
		throw `${currentFile}: line ${line}: syntax error: ${message}`;
	}

	function findSymbolInScope(content, line, symbol, startPosition, length) {
		let scopeStack = [];

		for (let i = startPosition; i < length; i++) {
			const c = content[i];

			if (c == '\n') {
				line++;
			}
			if (scopeStack.length == 0) {
				if (c == symbol) {
					return i;
				} else if (c == '"') {
					scopeStack.push('"');
				} else if (c == '$' && i < length - 1 && content[i + 1] == '(') {
					i++;
					scopeStack.push(')');
				} else if (c == '`') {
					scopeStack.push('`');
				} else if (c == "'") {
					scopeStack.push("'");
				} else {
					// continue
				}
			} else {
				const top = scopeStack[scopeStack.length - 1];
				if (c == top) {
					scopeStack.pop();
				} else if (top == '"' && c == '$' && i < length - 1 && content[i + 1] == '(') {
					i++;
					scopeStack.push(')');
				} else if (top == '"' && c == '`') {
					scopeStack.push('`');
				} else if (top == ')' || top == '`') {
					if (c == '"') {
						scopeStack.push('"');
					} else if (c == "'") {
						scopeStack.push("'");
					} else {
						// continue
					}
				} else {
					// continue
				}
			}
		}

		syntaxError(line, "unexpected end of file");
	}

	function doubleQuoteToAst(quoteContent, line) {
		const length = quoteContent.length;

		let astRoot = ast.value.compound();

		let buffer = "";

		const QS_INIT         = 0;
		const QS_VARIABLE     = 1;
		const QS_SUBSTITUTION = 2;
		let state = QS_INIT;

		for (let i = 0; i < length; i++) {
			const c = quoteContent[i];
			if (c == '\n') {
				line++;
			}
			switch(state) {
				case QS_INIT:
						if (c == '$') {
							astRoot.add(ast.value.string(buffer));
							buffer = "";
							if (i < length - 1 && quoteContent[i + 1] == '(') {
								state = QS_SUBSTITUTION;
								i += 1;
							} else {
								state = QS_VARIABLE;
							}
						} else {
							buffer += c;
						}
					break;
				case QS_VARIABLE:
					if (!("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".includes(c))) {
						astRoot.add(ast.value.variable(buffer));
						buffer = "";
						state = QS_INIT;
						i--;
					} else {
						buffer += c;
					}
					break;
				case QS_SUBSTITUTION:
					throw "not implemented";
					break;
				default:
					panic(line, "unknown parse state");
					break;
			}
		}

		if (buffer) {
			switch(state) {
				case QS_INIT:
					astRoot.add(ast.value.string(buffer));
					break;
				case QS_VARIABLE:
					astRoot.add(ast.value.variable(buffer));
					break;
				case QS_SUBSTITUTION:
					throw "not implemented";
					break;
				default:
					panic(line, "unknown parse state");
					break;
			}
		}

		return [astRoot, line];
	}

	function parseCommands(content) {
		let line = 1;

		const PS_INIT     = 0;
		const PS_COMMENT  = -1;
		const PS_COMMAND  = 1;
		const PS_ASSIGN   = 2;

		let astRoot = ast.sequence();
		let current = null;
		let value = null;

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
						current = ast.command();
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
						if (value) {
							if (buffer) {
								if (buffer[0] == '$') {
									value.add(ast.value.variable(buffer.substring(1)));
								} else {
									value.add(ast.value.string(buffer.replaceAll('\\$', '$')));
								}
								buffer = "";
							}
							current.add(value.reduce());
							value = null;
						} else if (buffer) {
							if (buffer[0] == '$') {
								current.add(ast.value.variable(buffer.substring(1)));
							} else {
								current.add(ast.value.string(buffer.replaceAll('\\$', '$')));
							}
							buffer = "";
						}
						astRoot.add(current);
						current = null;
						state = PS_INIT;
					} else if (c == ' ' || c == '\t') {
						if (value) {
							if (buffer) {
								if (buffer[0] == '$') {
									value.add(ast.value.variable(buffer.substring(1)));
								} else {
									value.add(ast.value.string(buffer.replaceAll('\\$', '$')));
								}
								buffer = "";
							}
							current.add(value.reduce());
							value = null;
						} else if (buffer) {
							if (buffer[0] == '$') {
								current.add(ast.value.variable(buffer.substring(1)));
							} else {
								current.add(ast.value.string(buffer.replaceAll('\\$', '$')));
							}
							buffer = "";
						}
					} else if (c == '"') {
						if (!value) {
							value = ast.value.compound();
						}
						if (buffer) {
							value.add(ast.value.string(buffer));
							buffer = "";
						}

						const end = findSymbolInScope(content, line, '"', i + 1, length);
						const [_ast, _line] = doubleQuoteToAst(content.substring(i + 1, end), line);
						line = _line;

						value.add(_ast);

						i = end;
					} else if (c == "'") {
						const end = findSymbolInScope(content, line, "'", i + 1, length);
						buffer += content.substring(i + 1, end);
						if (buffer && buffer[0] == '$') {
							// mask dollar sign in buffer so the variable is not expanded
							buffer = '\\' + buffer;
						}
						i = end;
					} else if (c == '=' && current.size() == 0) {
						current = ast.assignment(buffer);
						state = PS_ASSIGN;
						buffer = "";
					} else {
						buffer += c;
					}
					break;
				case PS_ASSIGN:
					// check for escape and quotes
					if (c == ';' || c == '\n') {
						if (value) {
							if (buffer) {
								if (buffer[0] == "$") {
									value.add(ast.value.variable(buffer.substring(1)));
								} else {
									value.add(ast.value.string(buffer));
								}
							}
							current.setValue(value.reduce());
							value = null;
						} else if (buffer) {
							if (buffer[0] == "$") {
								current.setValue(ast.value.variable(buffer.substring(1)));
							} else {
								current.setValue(ast.value.string(buffer));
							}
						} else {
							current.setValue(ast.value.string(""));
						}
						buffer = "";
						astRoot.add(current);
						current = null;
						state = PS_INIT;
					} else if (c == '"') {
						if (!value) {
							value = ast.value.compound();
						}
						if (buffer) {
							value.add(ast.value.string(buffer));
							buffer = "";
						}

						const end = findSymbolInScope(content, line, '"', i + 1, length);
						const [_ast, _line] = doubleQuoteToAst(content.substring(i + 1, end), line);
						line = _line;

						value.add(_ast);

						i = end;
					} else if (c == "'") {
						const end = findSymbolInScope(content, line, "'", i + 1, length);
						buffer += content.substring(i + 1, end);
						i = end;
					} else if (c == ' ' || c == '\t') {
						// would normale set exported variable for command but we don't support that anyway
						// current.setValue(astValueString(buffer));
						buffer = "";
						current = null;
						state = PS_INIT;
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
