"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const template = require("babel-template");
const t = require("babel-types");
const babel_core_1 = require("babel-core");
const code_frame_1 = require("@babel/code-frame");
const lodash_1 = require("lodash");
function isAliasThis(p, name) {
    const binding = p.scope.getBinding(name);
    if (binding) {
        return binding.path.isVariableDeclarator() && binding.path.get('init').isThisExpression();
    }
    return false;
}
exports.isAliasThis = isAliasThis;
function isValidVarName(str) {
    if (typeof str !== 'string') {
        return false;
    }
    if (str.trim() !== str) {
        return false;
    }
    try {
        // tslint:disable-next-line:no-unused-expression
        new Function(str, 'var ' + str);
    }
    catch (e) {
        return false;
    }
    return true;
}
exports.isValidVarName = isValidVarName;
function parseCode(code) {
    return babel_core_1.transform(code, {
        parserOpts: {
            sourceType: 'module',
            plugins: [
                'classProperties',
                'jsx',
                'flow',
                'flowComment',
                'trailingFunctionCommas',
                'asyncFunctions',
                'exponentiationOperator',
                'asyncGenerators',
                'objectRestSpread',
                'decorators',
                'dynamicImport'
            ]
        }
    }).ast;
}
exports.parseCode = parseCode;
exports.buildTemplate = (str) => template(str)().expression;
function buildBlockElement() {
    return t.jSXElement(t.jSXOpeningElement(t.jSXIdentifier('Block'), []), t.jSXClosingElement(t.jSXIdentifier('Block')), []);
}
exports.buildBlockElement = buildBlockElement;
function pascalName(s) {
    const str = lodash_1.camelCase(s);
    return lodash_1.capitalize(str[0]) + str.slice(1);
}
exports.pascalName = pascalName;
function buildRender(returned, stateKeys, propsKeys, templateType) {
    const returnStatement = [t.returnStatement(returned)];
    if (stateKeys.length) {
        const stateDecl = t.variableDeclaration('const', [
            t.variableDeclarator(t.objectPattern(Array.from(new Set(stateKeys)).filter(s => !propsKeys.includes(s)).map(s => t.objectProperty(t.identifier(s), t.identifier(s)))), t.memberExpression(t.thisExpression(), t.identifier('state')))
        ]);
        returnStatement.unshift(stateDecl);
    }
    if (propsKeys.length) {
        let patterns = t.objectPattern(Array.from(new Set(propsKeys)).map(s => t.objectProperty(t.identifier(s), t.identifier(s))));
        if (typeof templateType === 'string') {
            patterns = t.objectPattern([
                t.objectProperty(t.identifier('data'), templateType === 'wxParseData'
                    ? t.objectPattern([t.objectProperty(t.identifier('wxParseData'), t.identifier('wxParseData'))])
                    : t.identifier(templateType))
            ]);
        }
        else if (Array.isArray(templateType)) {
            patterns = t.objectPattern([
                t.objectProperty(t.identifier('data'), patterns)
            ]);
        }
        const stateDecl = t.variableDeclaration('const', [
            t.variableDeclarator(patterns, t.memberExpression(t.thisExpression(), t.identifier('props')))
        ]);
        returnStatement.unshift(stateDecl);
    }
    return t.classMethod('method', t.identifier('render'), [], t.blockStatement(returnStatement));
}
exports.buildRender = buildRender;
function buildImportStatement(source, specifiers = [], defaultSpec) {
    return t.importDeclaration(defaultSpec ? [defaultSpec, ...specifiers].map((spec, index) => {
        if (index === 0) {
            return t.importDefaultSpecifier(t.identifier(defaultSpec));
        }
        return t.importSpecifier(t.identifier(spec), t.identifier(spec));
    }) : specifiers.map(s => t.importSpecifier(t.identifier(s), t.identifier(s))), t.stringLiteral(source));
}
exports.buildImportStatement = buildImportStatement;
exports.setting = {
    sourceCode: ''
};
function codeFrameError(node, msg) {
    let errMsg = '';
    try {
        errMsg = code_frame_1.codeFrameColumns(exports.setting.sourceCode, node && node.type && node.loc ? node.loc : node);
    }
    catch (error) {
        errMsg = 'failed to locate source';
    }
    return new Error(`${msg}
  -----
  ${errMsg}`);
}
exports.codeFrameError = codeFrameError;
// tslint:disable-next-line
exports.DEFAULT_Component_SET = new Set([
    'View',
    'ScrollView',
    'Swiper',
    'CoverView',
    'CoverImage',
    'Icon',
    'Text',
    'RichText',
    'Progress',
    'Button',
    'Checkbox',
    'Form',
    'Input',
    'Label',
    'Picker',
    'PickerView',
    'Radio',
    'RadioGroup',
    'CheckboxGroup',
    'Slider',
    'Switch',
    'Textarea',
    'Navigator',
    'Audio',
    'Image',
    'Video',
    'Camera',
    'LivePlayer',
    'LivePusher',
    'Map',
    'Canvas',
    'OpenData',
    'WebView',
    'SwiperItem',
    'MovableArea',
    'MovableView',
    'FunctionalPageNavigator',
    'Ad',
    'Block'
]);
//# sourceMappingURL=utils.js.map