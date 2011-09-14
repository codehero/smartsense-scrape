var sys = require("sys");
process.stdin.resume();
process.stdin.setEncoding("utf8");
var buffer = "";
process.stdin.on("data",function(chunk){
	buffer += chunk;
});


process.stdin.on("end",function(chunk){
	var x = JSON.parse(buffer);
	var base = x.date.split("/");
	var day = parseInt(base[2], 10);
	day = day * 100 + parseInt(base[0], 10);
	day = day * 100 + parseInt(base[1], 10);
	sys.puts(day);
});
