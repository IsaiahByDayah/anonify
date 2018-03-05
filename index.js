'use strict'; 
const express = require('express'); 
const bodyParser = require('body-parser'); 
const SlackClient = require('@slack/client');
const aaa = require("adjective-adjective-animal");

const FULL_KEY = 'xoxp-146917219830-146917220230-324479961909-deb3c420aa031aba0b0b4cf4c976ef93';
const webClient = new SlackClient.WebClient(FULL_KEY);

const BOT_KEY = 'xoxb-324359672722-MFHEKfsraU4Dk9GsczJDhFsv';
const botWebClient = new SlackClient.WebClient(BOT_KEY);

const membersChannel = 'test2';
const members = [
	'jordankid93'
];

const app = express(); 
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true })); 

let convos = [];
let requests = [];

app.post('/', (req, res) => { 
	let text = req.body.text; 
	console.log(req.body);

	if (req.body.command == '/anon-chat') {
		res.json({
			text: 'A new anonymous chat will begin with you shortly...'
		});

		let convo = {};
		let newConvo = newConvoConfig({
			id: req.body.user_id,
			username: req.body.user_name
		}, req.body.text)
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
			return botWebClient.chat.postMessage(convo.user.channel.id, "Just hold tight, we've notified the committee you'd like to chat anonymously and will let you know when someone responds!");
		})
		.then(function(msg){
			console.log("Message: ", msg);
			return aaa();
		})
		.then(function(request){
			convo.user.codename = request;
			requests.push(convo);
			console.log("Requests Object: ", requests);
			notifyCommittee('Hey Committee! `'+request+'` would like to chat! Type `/new-chats` to find out more');
		});
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
					listOfRequests += '> '+openReq.user.codename;
					if (openReq.message && openReq.message != '') {
						listOfRequests += ' - ' + openReq.message;
					}
					listOfRequests += '\n\n';
				}
			}
			console.log("Requests: ", listOfRequests);

			return res.json({
				text: listOfRequests + '\n\n type `/open-chat [convo-name]` to take one of these available convos.'
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
				return botWebClient.chat.postMessage(foundReq.member.channel.id, "Hey, type here and we're relay your messages.");
			});
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
const rtm = new SlackClient.RtmClient(BOT_KEY, {
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

// Load the current channels list asynchrously
let channelListPromise = botWebClient.channels.list();

// The client will emit an RTM.RTM_CONNECTION_OPENED the connection is ready for
// sending and receiving messages
rtm.on(SlackClient.CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, () => {
  console.log(`Ready`);
});

rtm.on(SlackClient.RTM_EVENTS.MESSAGE, (message) => {
	// For structure of `message`, see https://api.slack.com/events/message

	// Skip messages that are from a bot or my own user ID
	if ( (message.subtype && message.subtype === 'bot_message') ||
	   (!message.subtype && message.user === appData.selfId) ) {
	return;
	}

	// Log the message
	console.log('New message: ', message);
	// rtm.sendMessage('`'+message.text+'` right back at ya ;)', message.channel);
	// botWebClient.chat.postMessage(message.channel, 'Hey hey!');
	let fromChannel = message.channel;
	let toChannel = '';
	for (let convo of convos) {
		if (convo.user.channel.id == fromChannel) {
			toChannel = convo.member.channel.id;
			break;
		}
		else if (convo.member.channel.id == fromChannel) {
			toChannel = convo.user.channel.id;
			break;
		}
	}
	botWebClient.chat.postMessage(toChannel, message.text);
});

// Start the connecting process
rtm.start();

function notifyCommittee(message) {
	botWebClient.channels.list()
	.then(function(channels){
		console.log("Channels: ", channels);
		for (let channel of channels.channels) {
			if (channel.name == membersChannel) {
				return botWebClient.chat.postMessage(channel.id, message);
			}
		}
	});
}

function newConvoConfig(user, msg) {
	return new Promise(function(resolve, reject){
		let time = new Date().getTime();
		let userChannel = 'Anonify-' + time;
		let memberChannel = 'Anon-' + time; 

		let member = getRandom(members);

		let config = {};
		config.message = msg || "No additional message provided";
		config.user = {
			id: user.id,
			username: user.username,
			channel: {
				name: userChannel
			}
		};

		getUser({username: member})
		.then(function(memberInfo){
			config.member = {
				// id: memberInfo.id,
				// username: memberInfo.name,
				channel: {
					name: memberChannel	
				}
			};

			return resolve(config);
		});

	});
}

function getUser(q) {
	return new Promise(function(resolve, reject){
		botWebClient.users.list()
		.then(function(users){
			// return console.log("Users: ", users.members);
			for (let user of users.members) {
				// console.log("User: ", user);
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
