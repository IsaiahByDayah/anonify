'use strict'; 
require('dotenv').config();

const express = require('express'); 
const bodyParser = require('body-parser'); 
const SlackClient = require('@slack/client');
const aaa = require("adjective-adjective-animal");

const webClient = new SlackClient.WebClient(process.env.OAUTH_ACCESS_TOKEN);
console.log("OAUTH TOKEN: ", process.env.OAUTH_ACCESS_TOKEN);
const bot = new SlackClient.WebClient(process.env.BOT_ACCESS_TOKEN);
console.log("BOT TOKEN: ", process.env.BOT_ACCESS_TOKEN);

const membersChannel = process.env.ANNOUNCEMENT_CHANNEL;
console.log("Members Channel: ", membersChannel);
const members = process.env.MEMBERS.split(' ');
console.log("Members: ", members);

const app = express(); 
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true })); 

let convos = [];
let requests = [];

app.post('/', (req, res) => {

	if (req.body.command == '/anon-chat') {
		res.json({
			text: 'A new anonymous chat will begin with you shortly...'
		});

		let user = {
			id: req.body.user_id
		};
		let topic = req.body.text;

		startAnonConvo(user, topic);
	}
	else if (req.body.command == '/new-chats') {
		if (!members.includes(req.body.user_name)) {
			return res.json({
				text: "Sorry, this command is only for committee members"
			});
		}
		else {
			let listOfRequests = '';
			for (let openReq of requests) {
				if (openReq.member.id == undefined) {
					listOfRequests += '> '+openReq.user.codename + ' - ' + openReq.topic + '\n\n';
				}
			}
			console.log("Requests: ", listOfRequests);

			return res.json({
				text: listOfRequests + '\n\n type `/open-chat {codename}` to take one of these available convos.'
			});
		}
	}
	else if (req.body.command == '/open-chat') {
		if (!members.includes(req.body.user_name)) {
			return res.json({
				text: "Sorry, this command is only for committee members"
			});
		}
		else if (req.body.text == '') {
			return res.json({
				text: "Please specify what convo you want to open"
			});
		}
		else {
			let foundReq = undefined;

			for (let reqIndex in requests) {
				let convo = requests[reqIndex];
				if (convo.user.codename == req.body.text) {
					requests.splice(reqIndex, 1);
					convo.member.id = req.body.user_id;
					convo.member.username = req.body.user_name;
					convos.push(convo);
					foundReq = convo;
					break;
				}
			}

			res.json({
				text: foundReq.user.codename + " is all yours!"
			});

			webClient.groups.create(foundReq.member.channel.name)
			.then(function(group){
				console.log("Group: ", group);
				foundReq.member.channel.id = group.group.id;
				console.log("Member Channel: ", foundReq.member.channel.id);
				return webClient.groups.invite(foundReq.member.channel.id, appData.selfId);
			})
			.then(function(invite){
				console.log("Invite: ", invite);
				return bot.chat.postMessage(foundReq.member.channel.id, "Hey, type here and we're relay your messages.");
			});
		}
	}
	else if (req.body.command == '/reveal-chat') {
		console.log("Command: ", req.body);
		for (let convo of convos) {
			if (convo.user.channel.id == req.body.channel_id) {
				convo.user.reveal = true;
				bot.chat.postMessage(convo.member.channel.id, "*_"+convo.user.codename+" has revealed themselves as "+convo.user.username+"_*");
				return res.json({
					text: "*_You have revealed your username to "+convo.member.username+"_*"
				});
			}
		}
		res.json({
			text: "Hmmm, looks like you're not in an anonymous channel. Try switching to an anonymous channels and running `/reveal-chat` again to reveal your username"
		});
	}
	else if (req.body.command == '/close-chat') {
		res.json({
			text: "Closing anonymous chat..."
		});
		for (let convoIndex in convos) {
			let convo = convos[convoIndex];
			if (convo.user.channel.id == req.body.channel_id || convo.member.channel.id == req.body.channel_id) {
				convos.splice(convoIndex, 1);
				bot.chat.postMessage(convo.member.channel.id, "*_Anonymous chat closed._*");
				bot.chat.postMessage(convo.user.channel.id, "*_Anonymous chat closed._*");
			}
		}
	}
	else {
		res.json({
			text: "Sorry, I dont know that command :("
		});
	}


});

const server = app.listen(3000, () => { 
	console.log('Express server   listening on port %d in %s mode', server.address().port,   app.settings.env);
});

// Cache of data
const appData = {};

// Initialize the RTM client with the recommended settings. Using the defaults for these
// settings is deprecated.
const rtm = new SlackClient.RtmClient(process.env.BOT_ACCESS_TOKEN, {
  dataStore: false,
  useRtmConnect: true,
});

// The client will emit an RTM.AUTHENTICATED event on when the connection data is available
// (before the connection is open)
rtm.on(SlackClient.CLIENT_EVENTS.RTM.AUTHENTICATED, (connectData) => {
  // Cache the data necessary for this app in memory
  appData.selfId = connectData.self.id;
  console.log(`Logged in as ${appData.selfId} of team ${connectData.team.id}`);
});

// The client will emit an RTM.RTM_CONNECTION_OPENED the connection is ready for
// sending and receiving messages
rtm.on(SlackClient.CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, () => {
  console.log(`Ready`);
});

rtm.on(SlackClient.RTM_EVENTS.MESSAGE, (message) => {
	// For structure of `message`, see https://api.slack.com/events/message

	// Skip messages that are from a bot or my own user ID or some other thing we dont care about
	if ( (message.subtype && message.subtype === 'bot_message') ||
	   (!message.subtype && message.user === appData.selfId) ||
	   (message.subtype && message.subtype === 'group_join') ||
	   (message.subtype && message.subtype === 'group_archive') ||
	   (message.subtype && message.subtype === 'channel_join') ) {
	return;
	}

	let fromChannel = message.channel;
	let toChannel = '';
	for (let convo of convos) {
		if (convo.user.channel.id == fromChannel) {
			toChannel = convo.member.channel.id;
			message.text = '*'+(convo.user.reveal ? convo.user.username : convo.user.codename)+':* ' + message.text;
			break;
		}
		else if (convo.member.channel.id == fromChannel) {
			toChannel = convo.user.channel.id;
			message.text = '*'+convo.member.username+':* ' + message.text;
			break;
		}
	}

	if (toChannel) {
		bot.chat.postMessage(toChannel, message.text);
	}
	else if (message.text && message.text.toLowerCase().includes('help')) {
		bot.chat.postMessage(fromChannel, 'Hey! It looks like you\'re asking for help. A new anonymous chat will begin with you shortly...');
		startAnonConvo({id: message.user});
	}
	else {
		bot.chat.postMessage(fromChannel, ':( Sorry, I don\'t quite understand what you\'re saying. You can type "help" if you\'d like to speak with someone anonymously');
	}
});

console.log("Starting RTM...");
// Start the connecting process
rtm.start();

function startAnonConvo(user, topic) {
	let convo = {};

	newConvoConfig(user, topic)
	.then(function(config){
		console.log("Config: ", config);
		convo = config;
		return webClient.groups.create(convo.user.channel.name);
	})
	.then(function(group){
		console.log("Group: ", group);
		convo.user.channel.id = group.group.id;
		console.log("User Channel: ", convo.user.channel.id);
		return webClient.groups.invite(convo.user.channel.id, appData.selfId);
	})
	.then(function(invite){
		console.log("Invite: ", invite);
		return bot.chat.postMessage(convo.user.channel.id, "Just hold tight, we've notified the committee you'd like to chat anonymously and will let you know when someone responds!");
	})
	.then(function(msg){
		console.log("Message: ", msg);
		return aaa(1);
	})
	.then(function(codename){
		convo.user.codename = codename;
		requests.push(convo);
		console.log("Requests Object: ", requests);
		notifyCommittee('Hey Committee! `'+codename+'` would like to chat! Type `/new-chats` to find out more');
	});
}

function notifyCommittee(message) {
	console.log("Fetching channels...");
	bot.channels.list()
	.then(function(channels){
		console.log("Channels: ", channels);
		for (let channel of channels.channels) {
			if (channel.name == membersChannel) {
				return bot.chat.postMessage(channel.id, message);
			}
		}
	});
}

function newConvoConfig(user, topic) {
	return new Promise(function(resolve, reject){
		let time = new Date().getTime();
		let userChannel = 'Anonify-' + time;
		let memberChannel = 'Anon-' + time; 

		let member = getRandom(members);

		let config = {};
		config.topic = topic || "No topic";
		config.member = {
			channel: {
				name: memberChannel	
			}
		};

		getUser(user)
		.then(function(userInfo){
			console.log("User Info: ", userInfo);
			config.user = {
				id: userInfo.id,
				username: userInfo.name,
				reveal: false,
				channel: {
					name: userChannel
				}
			};

			return resolve(config);
		});

	});
}

function getUser(q) {
	return new Promise(function(resolve, reject){
		bot.users.list()
		.then(function(users){
			for (let user of users.members) {
				// TODO: dynamically match properties of q to properties of user
				if (q.username != undefined) {
					if (user.name == q.username) {
						return resolve(user);
					}
				}
				else if (q.id != undefined) {
					if (user.id == q.id) {
						return resolve(user);
					}
				}
			}

			return reject('User not found');
		});
	});
}

function getRandom(list) {
	return list[Math.floor(Math.random()*list.length)];
}
