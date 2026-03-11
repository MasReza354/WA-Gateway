import path from "path";
import fs from "fs";

import { helpers, modules } from "../../../lib/index.js";
import Client from "../../session/Client/handler/Client.js";
import ConnectionSession from "../../session/Session.js";
import { ButtonResponse, ListResponse } from "../../database/db/messageRespon.db.js";
import HistoryMessage from "../../database/db/history.db.js";
import SessionDatabase from "../../database/db/session.db.js";

class ControllerApi extends ConnectionSession {
	constructor() {
		super();
		this.history = new HistoryMessage();
		this.sessionDb = new SessionDatabase();
	}

	async checkSessionMode(req, res, sessions, isChannel = false) {
		try {
			const sessionName = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const session = await this.sessionDb.findOneSessionDB(sessionName);
			
			if (!session) {
				return { valid: false, message: `Session ${sessionName} not found` };
			}
			
			if (isChannel && !session.mode_channel) {
				return { valid: false, message: `Channel mode is DISABLED for session ${sessionName}` };
			}
			
			if (!isChannel && !session.mode_chat) {
				return { valid: false, message: `Chat mode is DISABLED for session ${sessionName}` };
			}
			
			return { valid: true };
		} catch (error) {
			console.log(error);
			return { valid: false, message: "Internal Server Error" };
		}
	}

	async clientValidator(req, res, sessions, target) {
		try {
			const toTarget = helpers.phoneNumber(target);
			const client = this.getClient();
			if (!client) {
				res.send({ status: 403, message: `Session ${sessions} not Found` });
				return { toTarget: null, client: null };
			} else if (client && client.isStop == true) {
				res.send({ status: 403, message: `Session ${sessions} is Stopped` });
				return { toTarget: null, client: null };
			}

			if (toTarget.includes("@g.us")) {
				var checkPhone = await client.groupMetadata(toTarget).catch((err) => console.log(err));
			} else if (toTarget.includes("@newsletter")) {
				var checkPhone = { id: toTarget };
			} else {
				var checkPhone = await client.onWhatsApp(toTarget);
			}
			if (!toTarget.includes("@g.us") && !toTarget.includes("@newsletter") && Array.isArray(checkPhone) && checkPhone.length) {
				return { toTarget, client };
			} else if (toTarget.includes("@g.us") && checkPhone?.id) {
				return { toTarget, client };
			} else if (toTarget.includes("@newsletter")) {
				return { toTarget, client };
			} else {
				res.send({ status: 403, message: `The Number/Group (${target}) is not Registered on WhatsApp` });
				return { toTarget: null, client: null };
			}
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async sendText(req, res) {
		try {
			let { sessions, target, message } = req.body;
			if (!sessions || !target || !message) {
				return res.send({ status: 400, message: "Input All Data!" });
			}
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			
			// Check session mode
			const modeCheck = await this.checkSessionMode(req, res, sessions, false);
			if (!modeCheck.valid) {
				return res.send({ status: 403, message: modeCheck.message });
			}
			
			const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
			if (!client || !toTarget) return;
			await new Client(client, toTarget).sendText(message);
			await this.history.pushNewMessage(sessions, "TEXT", toTarget, message);
			return res.send({ status: 200, message: `Success Send Message to ${target}!` });
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async sendNewsletter(req, res) {
		try {
			let { sessions, channelId, message } = req.body;
			if (!sessions || !channelId || !message) {
				return res.send({ status: 400, message: "Input All Data! (sessions, channelId, message)" });
			}
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			
			// Check session mode
			const modeCheck = await this.checkSessionMode(req, res, sessions, true);
			if (!modeCheck.valid) {
				return res.send({ status: 403, message: modeCheck.message });
			}
			
			const client = this.getClient();
			
			if (!client) {
				return res.send({ status: 403, message: `Session ${sessions} not Found` });
			} else if (client && client.isStop == true) {
				return res.send({ status: 403, message: `Session ${sessions} is Stopped` });
			}
			
			const channelJid = channelId.includes("@newsletter") ? channelId : `${channelId}@newsletter`;
			
			// Try multiple methods to send to channel
			let result = null;
			let lastError = null;
			
			// Method 1: Try sendMessage (standard Baileys)
			try {
				console.log('[Method 1] Trying sendMessage...');
				result = await Promise.race([
					client.sendMessage(channelJid, { text: message }),
					new Promise((_, reject) => 
						setTimeout(() => reject(new Error('Timeout 10s')), 10000)
					)
				]);
				console.log('[Method 1] SUCCESS!');
			} catch (e1) {
				console.log('[Method 1] Failed:', e1.message);
				lastError = e1;
				
				// Method 2: Try with newsletter JID format variation
				try {
					console.log('[Method 2] Trying with different JID format...');
					const altJid = channelId.endsWith('@newsletter') ? channelId : `${channelId}@newsletter`;
					result = await Promise.race([
						client.sendMessage(altJid, { text: message }),
						new Promise((_, reject) => 
							setTimeout(() => reject(new Error('Timeout 10s')), 10000)
						)
					]);
					console.log('[Method 2] SUCCESS!');
				} catch (e2) {
					console.log('[Method 2] Failed:', e2.message);
					lastError = e2;
					
					// Method 3: Try sendNode (low-level)
					try {
						console.log('[Method 3] Trying sendNode with proper channel format...');
						if (typeof client.sendNode === 'function') {
							const messageTag = client.generateMessageTag();
							console.log('[Method 3] Message tag:', messageTag);
							
							// Try with proper newsletter broadcast format
							result = await Promise.race([
								client.sendNode({
									tag: 'iq',
									attrs: {
										to: channelJid,
										type: 'set',
										id: messageTag,
										xmlns: 'w:m'
									},
									content: [{
										tag: 'message',
										attrs: {
											type: 'text',
											t: Date.now().toString()
										},
										content: [{
											tag: 'text',
											attrs: {},
											content: message
										}]
									}]
								}),
								new Promise((_, reject) => 
									setTimeout(() => reject(new Error('Timeout 10s')), 10000)
								)
							]);
							
							console.log('[Method 3] sendNode response:', JSON.stringify(result, null, 2));
							
							// Check if result has proper acknowledgment
							if (result && (result.attrs?.type === 'result' || result.id)) {
								console.log('[Method 3] Message acknowledged by server!');
							} else {
								console.log('[Method 3] WARNING: No proper acknowledgment from server');
								throw new Error('SendNode returned response but no acknowledgment');
							}
						} else {
							throw new Error('sendNode not available');
						}
					} catch (e3) {
						console.log('[Method 3] Failed:', e3.message);
						lastError = e3;
					}
				}
			}
			
			if (result) {
				await this.history.pushNewMessage(sessions, "NEWSLETTER", channelJid, message);
				return res.send({ status: 200, message: `Success Send Message to Channel ${channelId}!` });
			} else {
				// All methods failed
				return res.send({ 
					status: 408, 
					message: `Gagal mengirim ke channel ${channelId} setelah 3x percobaan.\n\n⚠️ KEMUNGKINAN BESAR:\nBaileys library TIDAK support penuh kirim pesan ke Channel WhatsApp.\n\nSolusi:\n1. Gunakan WhatsApp Business API resmi\n2. Atau gunakan library lain yang support channels\n3. Channel hanya bisa diposting dari WhatsApp mobile langsung`,
					error: lastError?.message
				});
			}
			
		} catch (error) {
			console.log('[ERROR] Unexpected error:', error);
			return res.send({ status: 500, message: `Internal Server Error: ${error.message}` });
		}
	}

	async sendNewsletterMedia(req, res) {
		try {
			let { sessions, channelId, message, url } = req.body;
			if (!sessions || !channelId) {
				return res.send({ status: 400, message: "Input Session & Channel ID!" });
			}
			const text = message ? message : "";
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const client = this.getClient();
			if (!client) {
				return res.send({ status: 403, message: `Session ${sessions} not Found` });
			} else if (client && client.isStop == true) {
				return res.send({ status: 403, message: `Session ${sessions} is Stopped` });
			}
			
			const channelJid = channelId.includes("@newsletter") ? channelId : `${channelId}@newsletter`;
			
			// Check session mode
			const modeCheck = await this.checkSessionMode(req, res, sessions, true);
			if (!modeCheck.valid) {
				return res.send({ status: 403, message: modeCheck.message });
			}
			
			let nameRandom = helpers.randomText(10);
			
			const sendWithTimeout = async (operation) => {
				return await Promise.race([
					operation,
					new Promise((_, reject) => 
						setTimeout(() => reject(new Error('Request timeout after 30s')), 30000)
					)
				]);
			};
			
			if (req.files && Object.keys(req.files).length !== 0) {
				const file = req.files.file;
				const dest = `./public/temp/${nameRandom}${path.extname(file.name)}`;
				await file.mv(dest);
				
				try {
					await sendWithTimeout(new Client(client, channelJid).sendMedia(dest, text, { file }));
					await this.history.pushNewMessage(sessions, "NEWSLETTER_MEDIA", channelJid, `File : ${file.name}, Caption : ${text}`);
					res.send({ status: 200, message: `Success Send Message to Channel ${channelId}!` });
					return await modules.sleep(3000).then(fs.unlinkSync(dest));
				} catch (sendError) {
					if (sendError.message.includes('timeout') || sendError.message.includes('Timed Out')) {
						return res.send({ 
							status: 408, 
							message: `Timeout: Tidak dapat mengirim media ke channel ${channelId}. Pastikan session adalah admin channel.`
						});
					}
					throw sendError;
				}
			} else if (url && (!req.files || Object.keys(req.files).length === 0)) {
				if (/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi.test(url)) {
					const buffer = await helpers.downloadAxios(url);
					const dest = `./public/temp/${nameRandom}`;
					fs.writeFileSync(dest, buffer.data);
					var opts = { file: { name: nameRandom, mimetype: buffer.headers["content-type"] } };
					
					try {
						await sendWithTimeout(new Client(client, channelJid).sendMedia(dest, text, opts));
						await this.history.pushNewMessage(sessions, "NEWSLETTER_MEDIA", channelJid, `File : ${url}, Caption : ${text}`);
						res.send({ status: 200, message: `Success Send Message to Channel ${channelId}!` });
						return await modules.sleep(3000).then(fs.unlinkSync(dest));
					} catch (sendError) {
						if (sendError.message.includes('timeout') || sendError.message.includes('Timed Out')) {
							return res.send({ 
								status: 408, 
								message: `Timeout: Tidak dapat mengirim media ke channel ${channelId}. Pastikan session adalah admin channel.`
							});
						}
						throw sendError;
					}
				} else {
					return res.send({ status: 400, message: "Invalid URL!" });
				}
			} else {
				return res.send({ status: 400, message: "No files were uploaded or no URL!" });
			}
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: `Internal Server Error: ${error.message}` });
		}
	}

	async sendLocation(req, res) {
		try {
			let { sessions, target, long, lat } = req.body;
			if (!sessions || !target || !long || !lat) {
				return res.send({ status: 400, message: "Input All Data!" });
			}
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
			if (!client || !toTarget) return;
			await new Client(client, toTarget).sendLocation(lat, long);
			await this.history.pushNewMessage(sessions, "LOCATION", toTarget, `Long : ${long} - Lat : ${lat}`);
			return res.send({ status: 200, message: `Success Send Message to ${target}!` });
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async sendMedia(req, res) {
		try {
			let { sessions, target, message, url } = req.body;
			if (!sessions || !target) {
				return res.send({ status: 400, message: "Input Session & Target!" });
			}
			const text = message ? message : "";
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
			if (!client || !toTarget) return;
			let nameRandom = helpers.randomText(10);
			if (req.files && Object.keys(req.files).length !== 0) {
				const file = req.files.file;
				const dest = `./public/temp/${nameRandom}${path.extname(file.name)}`;
				await file.mv(dest);
				await new Client(client, toTarget).sendMedia(dest, text, { file });
				await this.history.pushNewMessage(sessions, "MEDIA", toTarget, `File : ${file.name}, Caption : ${text}`);
				res.send({ status: 200, message: `Success Send Message to ${target}!` });
				return await modules.sleep(3000).then(fs.unlinkSync(dest));
			} else if (url && (!req.files || Object.keys(req.files).length === 0)) {
				if (/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi.test(url)) {
					const buffer = await helpers.downloadAxios(url);
					const dest = `./public/temp/${nameRandom}`;
					fs.writeFileSync(dest, buffer.data);
					var opts = { file: { name: nameRandom, mimetype: buffer.headers["content-type"] } };
					await new Client(client, toTarget).sendMedia(dest, text, opts);
					await this.history.pushNewMessage(sessions, "MEDIA", toTarget, `File : ${url}, Caption : ${text}`);
					res.send({ status: 200, message: `Success Send Message to ${target}!` });
					return await modules.sleep(3000).then(fs.unlinkSync(dest));
				} else {
					return res.send({ status: 400, message: "Invalid URL!" });
				}
			} else {
				return res.send({ status: 400, message: "No files were uploaded or no URL!" });
			}
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async sendSticker(req, res) {
		try {
			let { sessions, target, packname, author, url } = req.body;
			if (!sessions || !target) {
				return res.send({ status: 400, message: "Input Session & Target!" });
			}
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
			if (!client || !toTarget) return;
			let nameRandom = helpers.randomText(10);
			if (req.files && Object.keys(req.files).length !== 0) {
				const file = req.files.file;
				const dest = `./public/temp/${nameRandom}${path.extname(file.name)}`;
				await file.mv(dest);
				await new Client(client, toTarget).sendSticker(true, file.mimetype.split("/")[0], dest, packname, author, true);
				await this.history.pushNewMessage(sessions, "STICKER", toTarget, file.name);
				return res.send({ status: 200, message: `Success Send Message to ${target}!` });
			} else if (url && (!req.files || Object.keys(req.files).length === 0)) {
				if (/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi.test(url)) {
					const buffer = await helpers.downloadAxios(url);
					const dest = `./public/temp/${nameRandom}`;
					fs.writeFileSync(dest, buffer.data);
					await new Client(client, toTarget).sendSticker(true, buffer.headers["content-type"].split("/")[0], dest, packname, author, true);
					await this.history.pushNewMessage(sessions, "STICKER", toTarget, url);
					return res.send({ status: 200, message: `Success Send Message to ${target}!` });
				} else {
					return res.send({ status: 400, message: "Invalid URL!" });
				}
			} else {
				return res.send({ status: 400, message: "No files were uploaded or no URL!" });
			}
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async sendProduct(req, res) {
		try {
			let { sessions, target, title, message, footer, owner, currency, price, salePrice, url } = req.body;
			if (!sessions || !target) {
				return res.send({ status: 400, message: "Input Session & Target!" });
			}
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
			if (!client || !toTarget) return;
			let nameRandom = helpers.randomText(10);
			if (req.files && Object.keys(req.files).length !== 0) {
				const file = req.files.file;
				const dest = `./public/temp/${nameRandom}${path.extname(file.name)}`;
				await file.mv(dest);
				var opts = { title, currencyCode: currency, price, salePrice };
				await new Client(client, toTarget).sendProduct(dest, message, footer, owner, opts);
				await this.history.pushNewMessage(sessions, "PRODUCT", toTarget, `${title}, ${price} - ${salePrice}`);
				res.send({ status: 200, message: `Success Send Message to ${target}!` });
				return await modules.sleep(3000).then(fs.unlinkSync(dest));
			} else if (url && (!req.files || Object.keys(req.files).length === 0)) {
				if (/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi.test(url)) {
					const buffer = await helpers.downloadAxios(url);
					const dest = `./public/temp/${nameRandom}`;
					fs.writeFileSync(dest, buffer.data);
					var opts = { title, currencyCode: currency, price, salePrice };
					await new Client(client, toTarget).sendProduct(dest, message, footer, owner, opts);
					await this.history.pushNewMessage(sessions, "PRODUCT", toTarget, `${title}, ${price} - ${salePrice}`);
					res.send({ status: 200, message: `Success Send Message to ${target}!` });
					return await modules.sleep(3000).then(fs.unlinkSync(dest));
				} else {
					return res.send({ status: 400, message: "Invalid URL!" });
				}
			} else {
				return res.send({ status: 400, message: "No files were uploaded or no URL!" });
			}
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async sendContact(req, res) {
		try {
			let { sessions, target, contact, contactName, anotherContact } = req.body;
			if (!sessions || !target) {
				return res.send({ status: 400, message: "Input Session & Target!" });
			}
			if (anotherContact) {
				let arr = anotherContact.split(",");
				let arr2 = arr?.map((value, i) => {
					if (!value.includes("-")) return { err: "strip" };
					let number = value.split("-")[0].trim();
					let name = value.split("-")[1].trim();
					return { number, name };
				});
				for (let j = 0; j < arr2.length; j++) {
					if (arr2[j].err) {
						return res.send({ status: 400, message: `Wrong Number. Separate contact number and name by using - (min), And separate the second contact with , (comma). (e.g. 628111111111 - Baba, 62822222222 - Caca)` });
					}
				}
				var listNumber = arr2.map((value) => value.number);
				var listName = arr2.map((value) => value.name);
				listNumber.splice(0, 0, contact);
				listName.splice(0, 0, contactName);
			} else {
				var listNumber = [contact];
				var listName = [contactName];
			}
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
			if (!client || !toTarget) return;
			let stats;
			for (let i = 0; i < listNumber.length; i++) {
				const checking = await client.onWhatsApp(`${listNumber[i]}`);
				if (checking.length === 0) {
					console.log("ini gada array");
					stats = listNumber[i];
				}
			}
			if (stats) {
				return res.send({ status: 403, message: `The Number (${stats}) is not Registered on WhatsApp` });
			} else {
				await new Client(client, toTarget).sendContact(listNumber, listName);
				await this.history.pushNewMessage(sessions, "CONTACT", toTarget, `${contact} - ${contactName}, ${anotherContact}`);
				return res.send({ status: 200, message: `Success Send Message to ${target}!` });
			}
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async sendButton(req, res) {
		try {
			let { sessions, target, message, textFooter, button, btnMessage, urlButton, callButton, responUrl, responCall, url } = req.body;
			if (!sessions || !target) {
				return res.send({ status: 400, message: "Input Session & Target!" });
			}
			const footer = textFooter ? textFooter : "";
			const text = message ? message : "";
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
			if (!client || !toTarget) return;
			let nameRandom = helpers.randomText(10);
			if (req.files && Object.keys(req.files).length !== 0) {
				var file = req.files.file;
				var dest = `./public/temp/${nameRandom}${path.extname(file.name)}`;
				await file.mv(dest);
				var isFile = 1;
			} else if (url && (!req.files || Object.keys(req.files).length === 0)) {
				if (/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi.test(url)) {
					var buffer = await helpers.downloadAxios(url);
					var dest = `./public/temp/${nameRandom}`;
					fs.writeFileSync(dest, buffer.data);
					var isFile = 2;
				} else {
					return res.send({ status: 400, message: "Invalid URL!" });
				}
			}
			const randomId = helpers.randomText(21);
			const buttonFilter = Array.isArray(button) && button.length ? button.filter((x) => x != "") : button;

			const buttons =
				Array.isArray(buttonFilter) && buttonFilter.length
					? buttonFilter.map((value, index) => {
							let result = { index: 3 + index, quickReplyButton: { displayText: value, id: `${value}${randomId}` } };
							return result;
					  })
					: [{ index: 3, quickReplyButton: { displayText: buttonFilter, id: `${buttonFilter}${randomId}` } }];
			if (urlButton) {
				if (!/^(http(s)?:\/\/)[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/gm.test(responUrl)) {
					return res.send({ status: 400, message: `Make sure response url button is using http or https! Example: https://www.google.com/` });
				} else {
					buttons.splice(0, 0, { index: 1, urlButton: { displayText: urlButton, url: responUrl } });
				}
			}
			if (callButton) {
				buttons.splice(1, 0, { index: 2, callButton: { displayText: callButton, phoneNumber: responCall } });
			}
			const buttDb =
				Array.isArray(buttonFilter) && buttonFilter.length
					? buttonFilter.map((value, index) => {
							return `${value}${randomId}`;
					  })
					: [`${buttonFilter}${randomId}`];
			btnMessage = Array.isArray(btnMessage) && btnMessage.length ? btnMessage : [btnMessage];
			await new ButtonResponse().createButtonResponse(sessions, toTarget, randomId, buttDb, btnMessage);

			if (isFile == 1) {
				await new Client(client, toTarget).sendButton(text, footer, buttons, dest, file.mimetype);
			} else if (isFile == 2) {
				await new Client(client, toTarget).sendButton(text, footer, buttons, dest, buffer.headers["content-type"]);
			} else {
				await new Client(client, toTarget).sendButton(text, footer, buttons);
			}
			await this.history.pushNewMessage(sessions, "BUTTON", toTarget, message);
			return res.send({ status: 200, message: `Success Send Message to ${target}!` });
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async sendListMessage(req, res) {
		try {
			let { sessions, target, title, body, footer, button, titleRow, descRow, respRow } = req.body;
			if (!sessions || !target) {
				return res.send({ status: 400, message: "Input Session & Target!" });
			}
			body = body ? body : "";
			sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
			const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
			if (!client || !toTarget) return;
			const listFilter = titleRow.filter((x) => x != "");
			const descFilter = descRow.filter((x) => x != "");
			const randomId = helpers.randomText(21);
			let listRows = [];
			for (let i = 0; i < listFilter.length; i++) {
				listRows.push({ title: listFilter[i], rowId: `${listFilter[i]}${randomId}`, description: descFilter[i] });
			}
			const sections = [{ title: "Choose One", rows: listRows }];
			const listDb = listFilter.map((value, index) => {
				return `${value}${randomId}`;
			});
			await new ListResponse().createListResponse(sessions, toTarget, randomId, listDb, respRow);
			await new Client(client, toTarget).sendList(body, footer, title, button, sections);
			await this.history.pushNewMessage(sessions, "LIST", toTarget, title);
			return res.send({ status: 200, message: `Success Send Message to ${target}!` });
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async deleteHistory(req, res) {
		try {
			let { id } = req.query;
			if (id) {
				await this.history.deleteHistory(id);
				return res.send({ status: 200, message: `Success Delete History Send Message` });
			} else {
				return res.send({ status: 404, message: `Not Found` });
			}
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async deleteAllHistory(req, res) {
		try {
			await this.history.deleteAllHistory();
			return res.send({ status: 200, message: `Success Delete All History Send Message` });
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async getSessions(req, res) {
		try {
			const data = await this.session.findAll();
			return res.status(200).send({
				data,
			});
		} catch (error) {
			console.log(error);
			return res.send({ status: 500, message: "Internal Server Error" });
		}
	}

	async validateChannel(req, res) {
		try {
			const { sessions, channelId } = req.body;
			
			if (!sessions || !channelId) {
				return res.send({ status: 400, message: "Session and Channel ID required!" });
			}
			
			const client = this.getClient();
			console.log('[VALIDATE] Client exists:', !!client);
			
			if (!client) {
				return res.send({ status: 403, message: `Session ${sessions} not Found` });
			}
			
			const channelJid = channelId.includes("@newsletter") ? channelId : `${channelId}@newsletter`;
			console.log('[VALIDATE] Channel JID:', channelJid);
			
			// Check client connection state
			console.log('[VALIDATE] Client state:', {
				isStop: client.isStop,
				type: client.type,
				hasSend: typeof client.sendMessage === 'function'
			});
			
			// Try to get channel info (will timeout if not accessible)
			try {
				console.log('[VALIDATE] Sending test message...');
				const result = await Promise.race([
					client.sendMessage(channelJid, { text: '.' }), // Send dot message to test
					new Promise((_, reject) => 
						setTimeout(() => reject(new Error('Validation timeout after 15s')), 15000)
					)
				]);
				
				console.log('[VALIDATE] Test message sent:', result);
				
				// Delete the test message immediately
				try {
					await client.sendMessage(channelJid, { delete: result.key });
					console.log('[VALIDATE] Test message deleted');
				} catch (e) {
					console.log('[VALIDATE] Failed to delete test message:', e.message);
				}
				
				return res.send({ 
					status: 200, 
					valid: true,
					message: `Channel ${channelId} is accessible`,
					debug: {
						jid: channelJid,
						messageKey: result?.key
					}
				});
			} catch (error) {
				console.log('[VALIDATE] Error:', error.message);
				return res.send({ 
					status: 408, 
					valid: false,
					message: `Cannot access channel ${channelId}. Error: ${error.message}. Possible reasons:\n1. You are not an admin of this channel\n2. Channel ID is incorrect\n3. Channel has been deleted\n4. Session needs to be restarted`,
					debug: {
						error: error.message,
						stack: error.stack
					}
				});
			}
		} catch (error) {
			console.log('[VALIDATE] Unexpected error:', error);
			return res.send({ status: 500, message: `Internal Server Error: ${error.message}` });
		}
	}

	async debugSession(req, res) {
		try {
			const client = this.getClient();
			
			if (!client) {
				return res.send({ 
					status: 404, 
					message: "No active session",
					debug: null
				});
			}
			
			const debugInfo = {
				clientExists: true,
				clientType: typeof client,
				clientKeys: Object.keys(client).slice(0, 20),
				hasSendMessage: typeof client.sendMessage === 'function',
				isStop: client.isStop,
				type: client.type,
				ev: !!client.ev,
				ws: !!client.ws,
				authState: !!client.authState
			};
			
			console.log('[DEBUG] Session info:', debugInfo);
			
			return res.send({
				status: 200,
				message: "Session debug info",
				debug: debugInfo
			});
		} catch (error) {
			console.log('[DEBUG] Error:', error);
			return res.send({ status: 500, message: error.message });
		}
	}

	async testChannelSend(req, res) {
		try {
			const { sessions, channelId, message, method } = req.body;
			
			if (!sessions || !channelId || !message) {
				return res.send({ status: 400, message: "Sessions, channelId, and message required!" });
			}
			
			const client = this.getClient();
			if (!client) {
				return res.send({ status: 403, message: `Session ${sessions} not Found` });
			}
			
			const channelJid = channelId.includes("@newsletter") ? channelId : `${channelId}@newsletter`;
			const testMethod = method || 'all';
			let result = null;
			
			// Test specific method or all
			if (testMethod === '1' || testMethod === 'all') {
				console.log('[TEST] Method 1: sendMessage');
				try {
					result = await Promise.race([
						client.sendMessage(channelJid, { text: message }),
						new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 15s')), 15000))
					]);
					return res.send({ status: 200, method: 'sendMessage', success: true, result });
				} catch (e) {
					console.log('[TEST] Method 1 failed:', e.message);
					if (testMethod === '1') {
						return res.send({ status: 408, method: 'sendMessage', success: false, error: e.message });
					}
				}
			}
			
			if (testMethod === '2' || testMethod === 'all') {
				console.log('[TEST] Method 2: sendNode simple');
				try {
					result = await Promise.race([
						client.sendNode({
							tag: 'message',
							attrs: { to: channelJid, type: 'text', id: client.generateMessageTag() },
							content: [{ tag: 'text', attrs: {}, content: message }]
						}),
						new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 15s')), 15000))
					]);
					return res.send({ status: 200, method: 'sendNode-simple', success: true, result: JSON.stringify(result) });
				} catch (e) {
					console.log('[TEST] Method 2 failed:', e.message);
					if (testMethod === '2') {
						return res.send({ status: 408, method: 'sendNode-simple', success: false, error: e.message });
					}
				}
			}
			
			if (testMethod === '3' || testMethod === 'all') {
				console.log('[TEST] Method 3: sendNode with iq wrapper');
				try {
					result = await Promise.race([
						client.sendNode({
							tag: 'iq',
							attrs: {
								to: channelJid,
								type: 'set',
								id: client.generateMessageTag(),
								xmlns: 'w:m'
							},
							content: [{
								tag: 'message',
								attrs: { type: 'text', t: Date.now().toString() },
								content: [{ tag: 'text', attrs: {}, content: message }]
							}]
						}),
						new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 15s')), 15000))
					]);
					return res.send({ status: 200, method: 'sendNode-iq', success: true, result: JSON.stringify(result) });
				} catch (e) {
					console.log('[TEST] Method 3 failed:', e.message);
					if (testMethod === '3') {
						return res.send({ status: 408, method: 'sendNode-iq', success: false, error: e.message });
					}
				}
			}
			
			return res.send({ 
				status: 408, 
				message: 'All methods failed',
				tests: 'Try individual methods with method: "1", "2", or "3"'
			});
			
		} catch (error) {
			console.log('[TEST] Error:', error);
			return res.send({ status: 500, message: error.message });
		}
	}
}

export default ControllerApi;
