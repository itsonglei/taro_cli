"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const wxml_1 = require("./wxml");
const script_1 = require("./script");
const json_1 = require("./json");
const global_1 = require("./global");
const utils_1 = require("./utils");
function parse(option) {
    global_1.resetGlobals();
    const { wxml, wxses, imports, refIds } = wxml_1.parseWXML(option.path, option.wxml);
    const json = json_1.parseJSON(option.json);
    utils_1.setting.sourceCode = option.script;
    const ast = script_1.parseScript(option.script, wxml, json, wxses, refIds);
    return {
        ast,
        imports,
        errors: global_1.errors
    };
}
exports.parse = parse;
//# sourceMappingURL=index.js.map