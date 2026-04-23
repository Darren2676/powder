var fs=require(String.fromCharCode(39)+String.fromCharCode(102,115)+String.fromCharCode(39));
var p=String.fromCharCode(99,108,105,101,110,116,47,115,114,99,47,118,105,101,119,115,47,68,105,115,112,97,116,99,104,80,114,105,110,116,47,73,110,100,101,120,46,118,117,101);
var c=fs.readFileSync(p,String.fromCharCode(117,116,102,56));
var eol=c.indexOf(String.fromCharCode(13,10))>=0?String.fromCharCode(13,10):String.fromCharCode(10);
var bt=String.fromCharCode(96);
var dl=String.fromCharCode(36);
var bs=String.fromCharCode(92);
var sq=String.fromCharCode(39);
console.log(String.fromCharCode(69,79,76,58),eol===String.fromCharCode(13,10)?String.fromCharCode(67,82,76,70):String.fromCharCode(76,70));
