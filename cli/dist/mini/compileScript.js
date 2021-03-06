"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const path = require("path");
const wxTransformer = require("@tarojs/transformer-wx");
const util_1 = require("../util");
const constants_1 = require("../util/constants");
const npm_1 = require("../util/npm");
const resolve_npm_files_1 = require("../util/resolve_npm_files");
const helper_1 = require("./helper");
const astProcess_1 = require("./astProcess");
const isBuildingScripts = new Map();
function initCompileScripts() {
    isBuildingScripts.clear();
}
exports.initCompileScripts = initCompileScripts;
function compileDepScripts(scriptFiles, needUseBabel, buildDepSync) {
    const { nodeModulesPath, npmOutputDir, projectConfig, sourceDir, outputDir, appPath, buildAdapter, constantsReplaceList, isProduction, jsxAttributeNameReplace } = helper_1.getBuildData();
    const dependencyTree = helper_1.getDependencyTree();
    return scriptFiles.map((item) => __awaiter(this, void 0, void 0, function* () {
        if (path.isAbsolute(item)) {
            let outputItem;
            if (constants_1.NODE_MODULES_REG.test(item)) {
                outputItem = item.replace(nodeModulesPath, npmOutputDir).replace(path.extname(item), '.js');
            }
            else {
                outputItem = item.replace(path.join(sourceDir), path.join(outputDir)).replace(path.extname(item), '.js');
            }
            const weappConf = Object.assign({}, projectConfig.weapp);
            const useCompileConf = Object.assign({}, weappConf.compile);
            const compileExclude = useCompileConf.exclude || [];
            let isInCompileExclude = false;
            compileExclude.forEach(excludeItem => {
                if (item.indexOf(path.join(appPath, excludeItem)) >= 0) {
                    isInCompileExclude = true;
                }
            });
            if (isInCompileExclude) {
                util_1.copyFileSync(item, outputItem);
                return;
            }
            if (!isBuildingScripts.get(outputItem)) {
                isBuildingScripts.set(outputItem, true);
                try {
                    const code = fs.readFileSync(item).toString();
                    const transformResult = wxTransformer({
                        code,
                        sourcePath: item,
                        sourceDir,
                        outputPath: outputItem,
                        isNormal: true,
                        isTyped: constants_1.REG_TYPESCRIPT.test(item),
                        adapter: buildAdapter,
                        env: constantsReplaceList,
                        jsxAttributeNameReplace
                    });
                    const ast = transformResult.ast;
                    const res = astProcess_1.parseAst(constants_1.PARSE_AST_TYPE.NORMAL, ast, [], item, outputItem);
                    const fileDep = dependencyTree.get(item) || {};
                    let resCode = res.code;
                    if (needUseBabel) {
                        resCode = yield compileScriptFile(res.code, item, outputItem, buildAdapter);
                    }
                    fs.ensureDirSync(path.dirname(outputItem));
                    if (isProduction && needUseBabel) {
                        resCode = util_1.uglifyJS(resCode, item, appPath, projectConfig.plugins.uglify);
                    }
                    if (constants_1.NODE_MODULES_REG.test(item)) {
                        resCode = resolve_npm_files_1.npmCodeHack(outputItem, resCode, buildAdapter);
                    }
                    fs.writeFileSync(outputItem, resCode);
                    let modifyOutput = outputItem.replace(appPath + path.sep, '');
                    modifyOutput = modifyOutput.split(path.sep).join('/');
                    util_1.printLog("generate" /* GENERATE */, '依赖文件', modifyOutput);
                    // 编译依赖的脚本文件
                    if (util_1.isDifferentArray(fileDep['script'], res.scriptFiles)) {
                        if (buildDepSync) {
                            yield Promise.all(compileDepScripts(res.scriptFiles, needUseBabel, buildDepSync));
                        }
                        else {
                            compileDepScripts(res.scriptFiles, needUseBabel, buildDepSync);
                        }
                    }
                    // 拷贝依赖文件
                    if (util_1.isDifferentArray(fileDep['json'], res.jsonFiles)) {
                        helper_1.copyFilesFromSrcToOutput(res.jsonFiles);
                    }
                    if (util_1.isDifferentArray(fileDep['media'], res.mediaFiles)) {
                        helper_1.copyFilesFromSrcToOutput(res.mediaFiles);
                    }
                    fileDep['script'] = res.scriptFiles;
                    fileDep['json'] = res.jsonFiles;
                    fileDep['media'] = res.mediaFiles;
                    dependencyTree.set(item, fileDep);
                }
                catch (err) {
                    util_1.printLog("error" /* ERROR */, '编译失败', item.replace(appPath + path.sep, ''));
                    console.log(err);
                }
            }
        }
    }));
}
exports.compileDepScripts = compileDepScripts;
function compileScriptFile(content, sourceFilePath, outputFilePath, adapter) {
    return __awaiter(this, void 0, void 0, function* () {
        const { appPath, sourceDir, constantsReplaceList, jsxAttributeNameReplace, projectConfig } = helper_1.getBuildData();
        if (constants_1.NODE_MODULES_REG.test(sourceFilePath) && fs.existsSync(outputFilePath)) {
            return fs.readFileSync(outputFilePath).toString();
        }
        const babelConfig = util_1.getBabelConfig(projectConfig.plugins.babel);
        const compileScriptRes = yield npm_1.callPlugin('babel', content, sourceFilePath, babelConfig, appPath);
        const code = compileScriptRes.code;
        if (!helper_1.shouldTransformAgain()) {
            return code;
        }
        const transformResult = wxTransformer({
            code,
            sourcePath: sourceFilePath,
            sourceDir,
            outputPath: outputFilePath,
            isNormal: true,
            isTyped: false,
            adapter,
            env: constantsReplaceList,
            jsxAttributeNameReplace
        });
        const res = astProcess_1.parseAst(constants_1.PARSE_AST_TYPE.NORMAL, transformResult.ast, [], sourceFilePath, outputFilePath);
        return res.code;
    });
}
exports.compileScriptFile = compileScriptFile;
