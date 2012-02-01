var soda = require("soda")
, assert = require("assert")
, sys = require("sys");
var fs = require("fs");
var time = require("time");

if(process.argv.length < 4){
	var usage = [
		"Usage: CONFIG_FILE COMMAND",
		"COMMAND is one of:",
		"\tbatch",
		"\t\tread list of formatted dates in JSON format from stdin",
		"\tdaysBack N",
		"\t\tget energy usage from the Nth day back",
		"\tgetDay MM/DD/YYYY",
		"\t\tget energy usage from specific day"
	];
	sys.debug(usage.join("\n") + "\n");
	process.exit(1);
}

var config = JSON.parse(fs.readFileSync(process.argv[2]));

if(!("password" in config)){
	sys.debug("Configuration must specify password!");
	process.exit(1);
}

if(!("username" in config)){
	sys.debug("Configuration must specify username!");
	process.exit(1);
}

var gbrowser = soda.createClient({
	host: config.host || "localhost",
	port: config.port || 4444,
	url: "http://www.duquesnelight.com",
	browser: config.browser || "*firefox"
});

function downloadDay(browser, day, cb){
	var d = new time.Date();
	var record = {
		"date" : day,
		"TZ" : -d.getTimezoneOffset() * 60000,
		"energies":[]
	};

	var year = parseInt(day.substr(6));
	var month = parseInt(day.substr(3, 2));
	var date = parseInt(day.substr(0, 2));

	/* Set the target year. */
	var chain = browser.chain
		.click("id=udate")
		.click("css=select.ui-datepicker-year")
		.click("css=option[value=\""+ year +"\"]");

	/* Set the target month. */
	for(var i = 1; i < month; ++i)
		chain.click("css=span.ui-icon.ui-icon-circle-triangle-w");


	/* Generate the table and scrape. */
	chain.click("link=" + date)
		.click("id=btnSubmit")
		.click("link=Show Tabular View")
		.getText("//div[@id='usageControl_dataDetail']/table/tbody/tr[6]/td[2]", function(text){
			record.lowTemp = parseFloat(text.split(String.fromCharCode(176))[0]);
		})
		.getText("//div[@id='usageControl_dataDetail']/table/tbody/tr[5]/td[2]", function(text){
			record.highTemp = parseFloat(text.split(String.fromCharCode(176))[0]);
		});

		function genClosure(i){
			return function(text){
				record.energies[i] = text;
			}
		}

		for(var i = 0; i < 24; ++i){
			var str =
				"//div[@id='contentContainer']/div[2]/div/div[2]/center/table/tbody/tr["+ (2 + i) + "]/td[2]";
			chain = chain.getText(str, genClosure(i))
		}

		chain.end(function(err){
			if(err){
				record.err = err;
			}
			else{
				for(var i = 0; i < 24; ++i)
					record.energies[i] = parseFloat(record.energies[i]);
			}
			cb(err, browser, record);
		});
}

function onEnd(err, browser, record){

	var ret = 0;
	if(err){
		sys.debug(JSON.stringify(err));
		ret = 1;
	}

	browser.chain
		.testComplete()
		.end(function(err){
			sys.puts(JSON.stringify(record));
			process.exit(ret);
		});
}

function goToSmartSenseData(browser, cb){
	browser.chain
		.session()
		.open("/")
		.type("id=username", config.username)
		.clickAndWait("id=headerSubmitBtn")
		.type("id=pass", config.password)
		.clickAndWait("id=loginbtn")
		.clickAndWait("css=#home > a")
		.clickAndWait("css=div.buttonCenter")
		.clickAndWait("//div[@id='SMARTSENSEPILOTPROGRAM']/ul/li[2]")
		.clickAndWait("id=HOURLYMETERUSAGEPROFILE")
		.end(function(err){
			cb(err);
		});
}

if(process.argv[3] == "batch"){
	process.stdin.resume();
	process.stdin.setEncoding("utf8");
	var buffer = "";
	process.stdin.on("data",function(chunk){
		buffer += chunk;
	});

	process.stdin.on("end",function(chunk){
		var days = JSON.parse(buffer);

		/* If there is a batch field use that. */
		if("batch" in days)
			days = days.batch;

		if(!(days instanceof Array)){
			throw new Error("Batch format must be an array!");
		}

		goToSmartSenseData(gbrowser, function(err){

			if(err){
				onEnd(err, gbrowser, ret);
				return;
			}

			var ret = {"batch":[]};
			function doDay(counter){
				if(counter == days.length){
					onEnd(null, gbrowser, ret);
				}
				else{

					var datestr = days[counter] + "";
					datestr = datestr.substr(4, 2) +"/"+ datestr.substr(6, 2) +"/"+ datestr.substr(0,4);
					downloadDay(gbrowser, datestr, function(err, browser, record){
						if(err){
							onEnd(err, gbrowser, ret);
							return;
						}
						ret.batch.push(record);
						doDay(counter + 1);
					});
				}
			}

			doDay(0);
		});
	});

}
else if(process.argv[3] == "daysBack"){
	var back = parseInt(process.argv[4]);
	if(isNaN(back) || back < 1){
		sys.debug("N must be a positive integer!");
		process.exit(1);
	}

	goToSmartSenseData(gbrowser, function(err){

		/* Get current time,
		 * Round time to beginning of the current day,
		 * Jump back one second to the previous day. */
		var now = new time.Date();
		now = new time.Date(now.getFullYear(), now.getMonth(), now.getDate());
		now = new time.Date(now.getTime() - 1000 - (back - 1) * 86400000);

		/* Format date for calendar selection. */
		function dig2(v){
			if(v < 10)
				v = "0" + v;
			return v + "";
		}
		var theDate = [dig2(now.getMonth() + 1), dig2(now.getDate()), now.getFullYear()];
		theDate = theDate.join("/");

		if(err){
			onEnd(err, gbrowser, null);
		}
		else{
			downloadDay(gbrowser, theDate, onEnd);
		}
	});
}
else if(process.argv[3] == "getDay"){
	goToSmartSenseData(gbrowser, function(err){
		if(err){
			onEnd(err, gbrowser, null);
		}
		else{
			downloadDay(gbrowser, process.argv[4], onEnd);
		}
	});
}
else{
	sys.debug("Invalid parameter!");
}
