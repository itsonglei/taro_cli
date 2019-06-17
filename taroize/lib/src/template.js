"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const t = require("babel-types");
const utils_1 = require("./utils");
const path_1 = require("path");
const fs = require("fs");
const wxml_1 = require("./wxml");
const global_1 = require("./global");
function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}
const NumberWords = ['z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
function buildTemplateName(name) {
    if (/wx/i.test(name)) {
        return buildTemplateName('taro-' + name.slice(2, name.length));
    }
    const words = utils_1.pascalName(name + '-tmpl');
    // return words
    let str = [];
    for (const word of words) {
        if (isNumeric(word)) {
            str.push(NumberWords[word]);
        }
        else {
            str.push(word);
        }
    }
    return str.join('');
}
function parseTemplate(path, dirPath) {
    if (!path.container) {
        return;
    }
    const openingElement = path.get('openingElement');
    const attrs = openingElement.get('attributes');
    const is = attrs.find(attr => attr.get('name').isJSXIdentifier({ name: 'is' }));
    const data = attrs.find(attr => attr.get('name').isJSXIdentifier({ name: 'data' }));
    // const spread = attrs.find(attr => attr.get('name').isJSXIdentifier({ name: 'spread' }))
    const name = attrs.find(attr => attr.get('name').isJSXIdentifier({ name: 'name' }));
    const refIds = new Set();
    const loopIds = new Set();
    let imports = [];
    if (name) {
        const value = name.node.value;
        if (value === null || !t.isStringLiteral(value)) {
            throw new Error('template 的 `name` 属性只能是字符串');
        }
        const className = buildTemplateName(value.value);
        path.traverse(wxml_1.createWxmlVistor(loopIds, refIds, dirPath, [], imports));
        const firstId = Array.from(refIds)[0];
        refIds.forEach(id => {
            if (loopIds.has(id) && id !== firstId) {
                refIds.delete(id);
            }
        });
        const block = utils_1.buildBlockElement();
        block.children = path.node.children;
        let render;
        if (refIds.size === 0) {
            // 无状态组件
            render = utils_1.buildRender(block, [], []);
        }
        else if (refIds.size === 1) {
            // 只有一个数据源
            render = utils_1.buildRender(block, [], Array.from(refIds), firstId);
        }
        else {
            // 使用 ...spread
            render = utils_1.buildRender(block, [], Array.from(refIds), []);
        }
        const classProp = t.classProperty(t.identifier('options'), t.objectExpression([
            t.objectProperty(t.identifier('addGlobalClass'), t.booleanLiteral(true))
        ]));
        classProp.static = true;
        const classDecl = t.classDeclaration(t.identifier(className), t.memberExpression(t.identifier('Taro'), t.identifier('Component')), t.classBody([render, classProp]), []);
        path.remove();
        return {
            name: className,
            ast: classDecl
        };
    }
    else if (is) {
        const value = is.node.value;
        if (!value) {
            throw new Error('template 的 `is` 属性不能为空');
        }
        if (t.isStringLiteral(value)) {
            const className = buildTemplateName(value.value);
            let attributes = [];
            if (data) {
                attributes.push(data.node);
            }
            path.replaceWith(t.jSXElement(t.jSXOpeningElement(t.jSXIdentifier(className), attributes), t.jSXClosingElement(t.jSXIdentifier(className)), [], true));
        }
        else if (t.isJSXExpressionContainer(value)) {
            if (t.isStringLiteral(value.expression)) {
                const className = buildTemplateName(value.expression.value);
                let attributes = [];
                if (data) {
                    attributes.push(data.node);
                }
                path.replaceWith(t.jSXElement(t.jSXOpeningElement(t.jSXIdentifier(className), attributes), t.jSXClosingElement(t.jSXIdentifier(className)), [], true));
            }
            else if (t.isConditional(value.expression)) {
                const { test, consequent, alternate } = value.expression;
                if (!t.isStringLiteral(consequent) || !t.isStringLiteral(alternate)) {
                    throw new Error('当 template is 标签是三元表达式时，他的两个值都必须为字符串');
                }
                let attributes = [];
                if (data) {
                    attributes.push(data.node);
                }
                const block = utils_1.buildBlockElement();
                block.children = [t.jSXExpressionContainer(t.conditionalExpression(test, t.jSXElement(t.jSXOpeningElement(t.jSXIdentifier('Template'), attributes.concat([t.jSXAttribute(t.jSXIdentifier('is'), consequent)])), t.jSXClosingElement(t.jSXIdentifier('Template')), [], true), t.jSXElement(t.jSXOpeningElement(t.jSXIdentifier('Template'), attributes.concat([t.jSXAttribute(t.jSXIdentifier('is'), alternate)])), t.jSXClosingElement(t.jSXIdentifier('Template')), [], true)))];
                path.replaceWith(block);
            }
        }
        return;
    }
    throw new Error('template 标签必须指名 `is` 或 `name` 任意一个标签');
}
exports.parseTemplate = parseTemplate;
function getWXMLsource(dirPath, src, type) {
    try {
        return fs.readFileSync(path_1.resolve(dirPath, src), 'utf-8');
    }
    catch (e) {
        global_1.errors.push(`找不到这个路径的 wxml: <${type} src="${src}" />，该标签将会被忽略掉`);
        return '';
    }
}
function parseModule(jsx, dirPath, type) {
    const openingElement = jsx.get('openingElement');
    const attrs = openingElement.get('attributes');
    const src = attrs.find(attr => attr.get('name').isJSXIdentifier({ name: 'src' }));
    if (!src) {
        throw new Error(`${type} 标签必须包含 \`src\` 属性`);
    }
    const value = src.get('value');
    if (!value.isStringLiteral()) {
        throw new Error(`${type} 标签的 src 属性值必须是一个字符串`);
    }
    const srcValue = value.node.value;
    if (srcValue.startsWith('/')) {
        throw new Error(`import/include 的 src 请填入相对路径再进行转换：src="${srcValue}"`);
    }
    if (type === 'import') {
        const wxml = getWXMLsource(dirPath, srcValue, type);
        const { imports } = wxml_1.parseWXML(path_1.resolve(dirPath, srcValue), wxml, true);
        try {
            jsx.remove();
        }
        catch (error) {
            //
        }
        return imports;
    }
    else {
        const { wxml } = wxml_1.parseWXML(dirPath, getWXMLsource(dirPath, srcValue, type), true);
        const block = utils_1.buildBlockElement();
        try {
            if (wxml) {
                block.children = [wxml];
                jsx.replaceWith(wxml);
            }
            else {
                block.children = [t.jSXExpressionContainer(t.jSXEmptyExpression())];
                jsx.replaceWith(block);
            }
        }
        catch (error) {
            //
        }
    }
}
exports.parseModule = parseModule;
//# sourceMappingURL=template.js.map