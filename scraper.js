//Imports
var fs = require('fs');
var url = require('url');
var exec = require('child_process').exec;
var request = require('request');
var cheerio = require('cheerio'), $;
var events = require('events');
var config = require('./config.json');

//Global fields
var USERNAME = config.username;
var PASSWORD = config.password;
var DOWNLOAD_DIR = config.download_dir;
var DOWNLOAD_URL = config.download_url;
var TOKEN = '';

function start(url) {
	//Constructor
	var j = request.jar();
	request = request.defaults({jar:j});
	emitter = new events.EventEmitter();
	DOWNLOAD_URL = url;

	//Handle Events
	emitter.on('prefetch', function() {
		prefetch();
	});
	emitter.on('start', function() {
		authenticate();
	});
	emitter.on('authenticate', function() {
		loadPage();
	});
	emitter.on('loadPage', function() {
		extractLinks();
	});
	emitter.on('extractLinks', function(data1, data2) {
		getSecureToken(data1, data2);
	});
	emitter.on('secureToken', function(data) {
		download(data);
	});
	emitter.on('downloadStart', function() {
		console.log('Downloading..');
	});
	emitter.on('downloadEnd', function() {
		console.log('Download finished');
	});

	emitter.emit('prefetch');
}

function prefetch() {
	request('https://www.video2brain.com/de/login', function (error, response, body) {
		if (!error && response.statusCode == 200) {
			$ = cheerio.load(body);
			var html = $('body').html();
			var startPos = html.indexOf('ajftok');
			var endPos = html.indexOf('=";');

			TOKEN = html.slice(startPos + 10, endPos + 1);

			emitter.emit('start');
		}
	});
}

function authenticate() {
	var options = {
		url:'https://www.video2brain.com/de/custom/modules/user/user_ajax.cfc?method=login',
		method: 'POST',
		form: {
			email: USERNAME,
			password: PASSWORD,
			set_cookie: true,
			token: TOKEN
		}
	};

	request(options, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			emitter.emit('authenticate');
		}
	});
}

function loadPage() {
	request(DOWNLOAD_URL, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			$ = cheerio.load(body);

			var html = $('head').html();
			var startPos = html.indexOf('ajtok');
			var endPos = html.indexOf('=";');

			TOKEN = html.slice(startPos + 9, endPos + 1);

			emitter.emit('loadPage');
		}
	});
}

function extractLinks() {
	var $linksClean = [];
	var $linksDirty = $('body').find('#product_toc .video-title a');

	$linksDirty.each(function(i, elem) {
		$link = $(elem).attr('href');

		if ($link.indexOf("https://") > -1) {
			$linksClean[i] = $link;
		} else {
			$linksClean[i] = "https://www.video2brain.com/de/" + $link;
		}
	});

	for (var link in $linksClean) {
		request($linksClean[link], function (error, response, body) {
			if (!error && response.statusCode == 200) {
				//Put the dom into cheerio for further processing
				var $ = cheerio.load(body);

					var $videoLink = $('body').find('#html5_player').attr('src');

					if (typeof $videoLink != 'undefined') {
						emitter.emit('extractLinks', $linksClean[link], $videoLink);
					}
			}
		});
	}
}

function getSecureToken(metaLink, videoLink) {
	request(metaLink, function (error, response, body) {
		if (!error) {
			//Parsing for videoaccess
			var posStartAccessExp = body.indexOf('Video.access_exp = ');
			var posStartAccessHash = body.indexOf('Video.access_hash = ');

			var posEndAccessExp = body.indexOf(';', posStartAccessExp);
			var posEndAccessHash = body.indexOf(';', posStartAccessHash);

			var accessExp = body.substring(posStartAccessExp, posEndAccessExp);
			var accessHash = body.substring(posStartAccessHash, posEndAccessHash);

			accessExp = accessExp.replace(/Video./gi, "");
			accessExp = accessExp.replace(/ /gi, "");
			accessExp = accessExp.replace(/"/gi, "");
			accessExp = accessExp.replace(/access_exp=/gi, "");

			accessHash = accessHash.replace(/Video./gi, "");
			accessHash = accessHash.replace(/ /gi, "");
			accessHash = accessHash.replace(/"/gi, "");
			accessHash = accessHash.replace(/access_hash=/gi, "");

			//GET SECURE TOKEN
			var options = {
				url: 'https://www.video2brain.com/de/custom/modules/cdn/cdn.cfc?method=getSecureTokenJSON',
				method: 'POST',
				form: {
					expire: '1',
					path: videoLink,
					access_exp: accessExp,
					access_hash: accessHash,
					token: TOKEN
				}
			};

			request(options, function (error, response, body) {
				if (!error) {
					var secureToken = body.substring(1, body.indexOf('\\'));
					emitter.emit('secureToken', videoLink + '?' + secureToken);
				}
			});
		}
	});
}

function download(fileUrl) {
	emitter.emit('downloadStart');
	var fileName =  String(fileUrl.split('/').slice(-1)).split('?')[0];
	var dirName = DOWNLOAD_URL.split('/').pop();
	var mkdir = 'mkdir -p ' + DOWNLOAD_DIR + dirName;


	var child = exec(mkdir, function(err, stdout, stderr) {
		request(fileUrl, function(error, response, body) {
			//console.log(body);
			emitter.emit('downloadEnd');
		}).pipe(fs.createWriteStream(DOWNLOAD_DIR + dirName + '/' + fileName));
	});
}
 exports.start = start;
