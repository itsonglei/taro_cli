"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const himalaya_wxml_1 = require("himalaya-wxml");
const t = require("babel-types");
const lodash_1 = require("lodash");
const babel_traverse_1 = require("babel-traverse");
const utils_1 = require("./utils");
const events_1 = require("./events");
const template_1 = require("./template");
const global_1 = require("./global");
const constant_1 = require("./constant");
const babylon_1 = require("babylon");
const allCamelCase = (str) => str.charAt(0).toUpperCase() + lodash_1.camelCase(str.substr(1));
function buildSlotName(slotName) {
    return `render${slotName[0].toUpperCase() + slotName.replace('-', '').slice(1)}`;
}
var NodeType;
(function (NodeType) {
    NodeType["Element"] = "element";
    NodeType["Comment"] = "comment";
    NodeType["Text"] = "text";
})(NodeType || (NodeType = {}));
const WX_IF = 'wx:if';
const WX_ELSE_IF = 'wx:elif';
const WX_FOR = 'wx:for';
const WX_FOR_ITEM = 'wx:for-item';
const WX_FOR_INDEX = 'wx:for-index';
const WX_KEY = 'wx:key';
exports.wxTemplateCommand = [
    WX_IF,
    WX_ELSE_IF,
    WX_FOR,
    WX_FOR_ITEM,
    WX_FOR_INDEX,
    WX_KEY,
    'wx:else'
];
function buildElement(name, children = [], attributes = []) {
    return {
        tagName: name,
        type: NodeType.Element,
        attributes,
        children
    };
}
exports.createWxmlVistor = (loopIds, refIds, dirPath, wxses = [], imports = []) => {
    const jsxAttrVisitor = (path) => {
        const name = path.node.name;
        const jsx = path.findParent(p => p.isJSXElement());
        const valueCopy = lodash_1.cloneDeep(path.get('value').node);
        transformIf(name.name, path, jsx, valueCopy);
        const loopItem = transformLoop(name.name, path, jsx, valueCopy);
        if (loopItem) {
            if (loopItem.index) {
                loopIds.add(loopItem.index);
            }
            if (loopItem.item) {
                loopIds.add(loopItem.item);
            }
        }
    };
    return {
        JSXAttribute: jsxAttrVisitor,
        JSXIdentifier(path) {
            const nodeName = path.node.name;
            if (path.parentPath.isJSXAttribute()) {
                if (nodeName === WX_KEY) {
                    path.replaceWith(t.jSXIdentifier('key'));
                }
                if (nodeName.startsWith('wx:') && !exports.wxTemplateCommand.includes(nodeName)) {
                    // tslint:disable-next-line
                    console.log(`未知 wx 作用域属性： ${nodeName}，该属性会被移除掉。`);
                    path.parentPath.remove();
                }
            }
        },
        JSXElement: {
            enter(path) {
                const openingElement = path.get('openingElement');
                const jsxName = openingElement.get('name');
                const attrs = openingElement.get('attributes');
                if (!jsxName.isJSXIdentifier()) {
                    return;
                }
                path.traverse({
                    Identifier(p) {
                        if (!p.isReferencedIdentifier()) {
                            return;
                        }
                        const jsxExprContainer = p.findParent(p => p.isJSXExpressionContainer());
                        if (!jsxExprContainer || !jsxExprContainer.isJSXExpressionContainer()) {
                            return;
                        }
                        if (utils_1.isValidVarName(p.node.name)) {
                            refIds.add(p.node.name);
                        }
                    },
                    JSXAttribute: jsxAttrVisitor
                });
                const slotAttr = attrs.find(a => a.node.name.name === 'slot');
                if (slotAttr) {
                    const slotValue = slotAttr.node.value;
                    if (slotValue && t.isStringLiteral(slotValue)) {
                        const slotName = slotValue.value;
                        const parentComponent = path.findParent(p => p.isJSXElement() && t.isJSXIdentifier(p.node.openingElement.name) && !utils_1.DEFAULT_Component_SET.has(p.node.openingElement.name.name));
                        if (parentComponent && parentComponent.isJSXElement()) {
                            slotAttr.remove();
                            path.traverse({
                                JSXAttribute: jsxAttrVisitor
                            });
                            const block = utils_1.buildBlockElement();
                            block.children = [lodash_1.cloneDeep(path.node)];
                            parentComponent.node.openingElement.attributes.push(t.jSXAttribute(t.jSXIdentifier(buildSlotName(slotName)), t.jSXExpressionContainer(block)));
                            path.remove();
                        }
                    }
                    else {
                        throw utils_1.codeFrameError(slotValue, 'slot 的值必须是一个字符串');
                    }
                }
                const tagName = jsxName.node.name;
                if (tagName === 'Slot') {
                    const nameAttr = attrs.find(a => a.node.name.name === 'name');
                    let slotName = '';
                    if (nameAttr) {
                        if (nameAttr.node.value && t.isStringLiteral(nameAttr.node.value)) {
                            slotName = nameAttr.node.value.value;
                        }
                        else {
                            throw utils_1.codeFrameError(jsxName.node, 'slot 的值必须是一个字符串');
                        }
                    }
                    const children = t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('props')), t.identifier(slotName ? buildSlotName(slotName) : 'children'));
                    try {
                        path.replaceWith(path.parentPath.isJSXElement() ? t.jSXExpressionContainer(children) : children);
                    }
                    catch (error) {
                        //
                    }
                }
                if (tagName === 'Wxs') {
                    wxses.push(getWXS(attrs.map(a => a.node), path, imports));
                }
                if (tagName === 'Template') {
                    // path.traverse({
                    //   JSXAttribute: jsxAttrVisitor
                    // })
                    const template = template_1.parseTemplate(path, dirPath);
                    if (template) {
                        const { ast: classDecl, name } = template;
                        const taroComponentsImport = utils_1.buildImportStatement('@tarojs/components', [
                            ...global_1.usedComponents
                        ]);
                        const taroImport = utils_1.buildImportStatement('@tarojs/taro', [], 'Taro');
                        // const withWeappImport = buildImportStatement(
                        //   '@tarojs/with-weapp',
                        //   [],
                        //   'withWeapp'
                        // )
                        const ast = t.file(t.program([]));
                        ast.program.body.unshift(taroComponentsImport, taroImport, 
                        // withWeappImport,
                        t.exportDefaultDeclaration(classDecl));
                        let usedTemplate = new Set();
                        babel_traverse_1.default(ast, {
                            JSXIdentifier(p) {
                                const node = p.node;
                                if (node.name.endsWith('Tmpl') && node.name.length > 4 && p.parentPath.isJSXOpeningElement()) {
                                    usedTemplate.add(node.name);
                                }
                            }
                        });
                        usedTemplate.forEach(componentName => {
                            if (componentName !== classDecl.id.name) {
                                ast.program.body.unshift(utils_1.buildImportStatement(`./${componentName}`, [], componentName));
                            }
                        });
                        imports.push({
                            ast,
                            name
                        });
                    }
                }
                if (tagName === 'Import') {
                    const mods = template_1.parseModule(path, dirPath, 'import');
                    if (mods) {
                        imports.push(...mods);
                    }
                }
                if (tagName === 'Include') {
                    template_1.parseModule(path, dirPath, 'include');
                }
            },
            exit(path) {
                const openingElement = path.get('openingElement');
                const jsxName = openingElement.get('name');
                if (!jsxName.isJSXIdentifier({ name: 'Block' })) {
                    return;
                }
                const children = path.node.children;
                if (children.length === 1) {
                    const caller = children[0];
                    if (t.isJSXExpressionContainer(caller) && t.isCallExpression(caller.expression) && !path.parentPath.isExpressionStatement()) {
                        try {
                            path.replaceWith(caller);
                        }
                        catch (error) {
                            //
                        }
                    }
                }
            }
        }
    };
};
function parseWXML(dirPath, wxml, parseImport) {
    if (!parseImport) {
        global_1.errors.length = 0;
        global_1.usedComponents.clear();
    }
    global_1.usedComponents.add('Block');
    let wxses = [];
    let imports = [];
    const refIds = new Set();
    const loopIds = new Set();
    if (!wxml) {
        return {
            wxses,
            imports,
            refIds,
            wxml: t.nullLiteral()
        };
    }
    const nodes = removEmptyTextAndComment(himalaya_wxml_1.parse(wxml.trim()));
    const ast = t.file(t.program([
        t.expressionStatement(parseNode(buildElement('block', nodes)))
    ], []));
    babel_traverse_1.default(ast, exports.createWxmlVistor(loopIds, refIds, dirPath, wxses, imports));
    refIds.forEach(id => {
        if (loopIds.has(id) || imports.filter(i => i.wxs).map(i => i.name).includes(id)) {
            refIds.delete(id);
        }
    });
    return {
        wxses,
        imports,
        wxml: hydrate(ast),
        refIds
    };
}
exports.parseWXML = parseWXML;
function getWXS(attrs, path, imports) {
    let moduleName = null;
    let src = null;
    for (const attr of attrs) {
        if (t.isJSXIdentifier(attr.name)) {
            const attrName = attr.name.name;
            const attrValue = attr.value;
            let value = null;
            if (attrValue === null) {
                throw new Error('WXS 标签的属性值不得为空');
            }
            if (t.isStringLiteral(attrValue)) {
                value = attrValue.value;
            }
            else if (t.isJSXExpressionContainer(attrValue) &&
                t.isStringLiteral(attrValue.expression)) {
                value = attrValue.expression.value;
            }
            if (attrName === 'module') {
                moduleName = value;
            }
            if (attrName === 'src') {
                src = value;
            }
        }
    }
    if (!src) {
        const { children: [script] } = path.node;
        if (!t.isJSXText(script)) {
            throw new Error('wxs 如果没有 src 属性，标签内部必须有 wxs 代码。');
        }
        src = './wxs__' + moduleName;
        imports.push({
            ast: utils_1.parseCode(script.value),
            name: moduleName,
            wxs: true
        });
    }
    if (!moduleName || !src) {
        throw new Error('一个 WXS 需要同时存在两个属性：`wxs`, `src`');
    }
    path.remove();
    return {
        module: moduleName,
        src
    };
}
function hydrate(file) {
    const ast = file.program.body[0];
    if (ast && t.isExpressionStatement(ast) && t.isJSXElement(ast.expression)) {
        const jsx = ast.expression;
        if (jsx.children.length === 1) {
            const children = jsx.children[0];
            return t.isJSXExpressionContainer(children)
                ? children.expression
                : children;
        }
        else {
            return jsx;
        }
    }
}
function transformLoop(name, attr, jsx, value) {
    const jsxElement = jsx.get('openingElement');
    if (!jsxElement.node) {
        return;
    }
    const attrs = jsxElement.get('attributes').map(a => a.node);
    const wxForItem = attrs.find(a => a.name.name === WX_FOR_ITEM);
    const hasSinglewxForItem = wxForItem && wxForItem.value && t.isJSXExpressionContainer(wxForItem.value);
    if (hasSinglewxForItem || name === WX_FOR || name === 'wx:for-items') {
        if (!value || !t.isJSXExpressionContainer(value)) {
            throw new Error('wx:for 的值必须使用 "{{}}"  包裹');
        }
        attr.remove();
        let item = t.stringLiteral('item');
        let index = t.stringLiteral('index');
        jsx
            .get('openingElement')
            .get('attributes')
            .forEach(p => {
            const node = p.node;
            if (node.name.name === WX_FOR_ITEM) {
                if (!node.value || !t.isStringLiteral(node.value)) {
                    throw new Error(WX_FOR_ITEM + ' 的值必须是一个字符串');
                }
                item = node.value;
                p.remove();
            }
            if (node.name.name === WX_FOR_INDEX) {
                if (!node.value || !t.isStringLiteral(node.value)) {
                    throw new Error(WX_FOR_INDEX + ' 的值必须是一个字符串');
                }
                index = node.value;
                p.remove();
            }
        });
        const replacement = t.jSXExpressionContainer(t.callExpression(t.memberExpression(value.expression, t.identifier('map')), [
            t.arrowFunctionExpression([t.identifier(item.value), t.identifier(index.value)], t.blockStatement([t.returnStatement(jsx.node)]))
        ]));
        const block = utils_1.buildBlockElement();
        block.children = [replacement];
        try {
            jsx.replaceWith(block);
        }
        catch (error) {
            //
        }
        return {
            item: item.value,
            index: index.value
        };
    }
}
function transformIf(name, attr, jsx, value) {
    if (name !== WX_IF) {
        return;
    }
    const conditions = [];
    let siblings = [];
    try {
        siblings = jsx.getAllNextSiblings().filter(s => !(s.isJSXExpressionContainer() && s.get('expression').isJSXEmptyExpression()));
    }
    catch (error) {
        return;
    }
    if (value === null || !t.isJSXExpressionContainer(value)) {
        // tslint:disable-next-line
        console.error('wx:if 的值需要用双括号 `{{}}` 包裹它的值');
        if (value && t.isStringLiteral(value)) {
            value = t.jSXExpressionContainer(utils_1.buildTemplate(value.value));
        }
    }
    conditions.push({
        condition: WX_IF,
        path: jsx,
        tester: value
    });
    attr.remove();
    for (let index = 0; index < siblings.length; index++) {
        const sibling = siblings[index];
        const next = lodash_1.cloneDeep(siblings[index + 1]);
        const currMatches = findWXIfProps(sibling);
        const nextMatches = findWXIfProps(next);
        if (currMatches === null) {
            break;
        }
        conditions.push({
            condition: currMatches.reg.input,
            path: sibling,
            tester: currMatches.tester
        });
        if (nextMatches === null) {
            break;
        }
    }
    handleConditions(conditions);
}
function handleConditions(conditions) {
    if (conditions.length === 1) {
        const ct = conditions[0];
        try {
            ct.path.replaceWith(t.jSXExpressionContainer(t.logicalExpression('&&', ct.tester.expression, lodash_1.cloneDeep(ct.path.node))));
        }
        catch (error) {
            //
        }
    }
    if (conditions.length > 1) {
        const lastLength = conditions.length - 1;
        const lastCon = conditions[lastLength];
        let lastAlternate = lodash_1.cloneDeep(lastCon.path.node);
        if (lastCon.condition === WX_ELSE_IF) {
            lastAlternate = t.logicalExpression('&&', lastCon.tester.expression, lastAlternate);
        }
        const node = conditions
            .slice(0, lastLength)
            .reduceRight((acc, condition) => {
            return t.conditionalExpression(condition.tester.expression, lodash_1.cloneDeep(condition.path.node), acc);
        }, lastAlternate);
        conditions[0].path.replaceWith(t.jSXExpressionContainer(node));
        conditions.slice(1).forEach(c => c.path.remove());
    }
}
function findWXIfProps(jsx) {
    let matches = null;
    jsx &&
        jsx.isJSXElement() &&
        jsx
            .get('openingElement')
            .get('attributes')
            .some(path => {
            const attr = path.node;
            if (t.isJSXIdentifier(attr.name)) {
                const name = attr.name.name;
                if (name === WX_IF) {
                    return true;
                }
                const match = name.match(/wx:else|wx:elif/);
                if (match) {
                    path.remove();
                    matches = {
                        reg: match,
                        tester: attr.value
                    };
                    return true;
                }
            }
            return false;
        });
    return matches;
}
function parseNode(node, tagName) {
    if (node.type === NodeType.Text) {
        return parseText(node, tagName);
    }
    else if (node.type === NodeType.Comment) {
        const emptyStatement = t.jSXEmptyExpression();
        emptyStatement.innerComments = [{
                type: 'CommentBlock',
                value: ' ' + node.content + ' '
            }];
        return t.jSXExpressionContainer(emptyStatement);
    }
    return parseElement(node);
}
function parseElement(element) {
    const tagName = t.jSXIdentifier(allCamelCase(element.tagName));
    if (utils_1.DEFAULT_Component_SET.has(tagName.name)) {
        global_1.usedComponents.add(tagName.name);
    }
    let attributes = element.attributes;
    if (tagName.name === 'Template') {
        let isSpread = false;
        attributes = attributes.map(attr => {
            if (attr.key === 'data') {
                const value = attr.value || '';
                const content = parseContent(value);
                if (content.type === 'expression') {
                    isSpread = true;
                    const str = content.content;
                    if (str.includes('...') && str.includes(',')) {
                        attr.value = `{{${str.slice(1, str.length - 1)}}}`;
                    }
                    else {
                        attr.value = `{{${str.slice(str.includes('...') ? 4 : 1, str.length - 1)}}}`;
                    }
                }
                else {
                    attr.value = content.content;
                }
            }
            return attr;
        });
        if (isSpread) {
            attributes.push({
                key: 'spread',
                value: null
            });
        }
    }
    return t.jSXElement(t.jSXOpeningElement(tagName, attributes.map(parseAttribute)), t.jSXClosingElement(tagName), removEmptyTextAndComment(element.children).map((el) => parseNode(el, element.tagName)), false);
}
function removEmptyTextAndComment(nodes) {
    return nodes.filter(node => {
        return node.type === NodeType.Element
            || (node.type === NodeType.Text && node.content.trim().length !== 0)
            || node.type === NodeType.Comment;
    }).filter((node, index) => !(index === 0 && node.type === NodeType.Comment));
}
function parseText(node, tagName) {
    if (tagName === 'wxs') {
        return t.jSXText(node.content);
    }
    const { type, content } = parseContent(node.content);
    if (type === 'raw') {
        const text = content.replace(/([{}]+)/g, "{'$1'}");
        return t.jSXText(text);
    }
    return t.jSXExpressionContainer(utils_1.buildTemplate(content));
}
const handlebarsRE = /\{\{((?:.|\n)+?)\}\}/g;
function parseContent(content) {
    content = content.trim();
    if (!handlebarsRE.test(content)) {
        return {
            type: 'raw',
            content
        };
    }
    const tokens = [];
    let lastIndex = (handlebarsRE.lastIndex = 0);
    let match;
    let index;
    let tokenValue;
    // tslint:disable-next-line
    while ((match = handlebarsRE.exec(content))) {
        index = match.index;
        // push text token
        if (index > lastIndex) {
            tokenValue = content.slice(lastIndex, index);
            tokens.push(JSON.stringify(tokenValue));
        }
        // tag token
        const exp = match[1].trim();
        tokens.push(`(${exp})`);
        lastIndex = index + match[0].length;
    }
    if (lastIndex < content.length) {
        tokenValue = content.slice(lastIndex);
        tokens.push(JSON.stringify(tokenValue));
    }
    return {
        type: 'expression',
        content: tokens.join('+')
    };
}
function parseAttribute(attr) {
    let { key, value } = attr;
    let jsxValue = null;
    if (value) {
        if (key === 'class' && value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, value.length - 1).replace(',', '');
            // tslint:disable-next-line
            console.log(utils_1.codeFrameError(attr, 'Taro/React 不支持 class 传入数组，此写法可能无法得到正确的 class'));
        }
        const { type, content } = parseContent(value);
        if (type === 'raw') {
            jsxValue = t.stringLiteral(content);
        }
        else {
            let expr;
            try {
                expr = utils_1.buildTemplate(content);
            }
            catch (error) {
                const pureContent = content.slice(1, content.length - 1);
                if (constant_1.reserveKeyWords.has(pureContent) && type !== 'raw') {
                    const err = `转换模板参数： \`${key}: ${value}\` 报错: \`${pureContent}\` 是 JavaScript 保留字，请不要使用它作为值。`;
                    if (key === WX_KEY) {
                        expr = t.stringLiteral('');
                    }
                    else {
                        throw new Error(err);
                    }
                }
                else if (content.includes(':')) {
                    const [key, value] = pureContent.split(':');
                    expr = t.objectExpression([t.objectProperty(t.stringLiteral(key), babylon_1.parseExpression(value))]);
                }
                else if (content.includes('...') && content.includes(',')) {
                    const objExpr = content.slice(1, content.length - 1).split(',');
                    const props = [];
                    for (const str of objExpr) {
                        const s = str.trim();
                        if (s.includes('...')) {
                            props.push(t.spreadProperty(t.identifier(s.slice(3))));
                        }
                        else {
                            props.push(t.objectProperty(t.identifier(s), t.identifier(s)));
                        }
                    }
                    expr = t.objectExpression(props);
                }
                else {
                    const err = `转换模板参数： \`${key}: ${value}\` 报错`;
                    throw new Error(err);
                }
            }
            if (t.isThisExpression(expr)) {
                // tslint:disable-next-line
                console.error('在参数中使用 `this` 可能会造成意想不到的结果，已将此参数修改为 `__placeholder__`，你可以在转换后的代码查找这个关键字修改。');
                expr = t.stringLiteral('__placeholder__');
            }
            jsxValue = t.jSXExpressionContainer(expr);
        }
    }
    const jsxKey = handleAttrKey(key);
    if (/^on[A-Z]/.test(jsxKey) && jsxValue && t.isStringLiteral(jsxValue)) {
        jsxValue = t.jSXExpressionContainer(t.memberExpression(t.thisExpression(), t.identifier(jsxValue.value)));
    }
    if (key.startsWith('catch') && value && value === 'true') {
        jsxValue = t.jSXExpressionContainer(t.memberExpression(t.thisExpression(), t.identifier('privateStopNoop')));
        global_1.globals.hasCatchTrue = true;
    }
    return t.jSXAttribute(t.jSXIdentifier(jsxKey), jsxValue);
}
function handleAttrKey(key) {
    if (key.startsWith('wx:') ||
        key.startsWith('wx-') ||
        key.startsWith('data-')) {
        return key;
    }
    else if (key === 'class') {
        return 'className';
    }
    else if (/^(bind|catch)[a-z|:]/.test(key)) {
        if (events_1.specialEvents.has(key)) {
            return events_1.specialEvents.get(key);
        }
        else {
            key = key.replace(/^(bind:|catch:|bind|catch)/, 'on');
            key = lodash_1.camelCase(key);
            if (!utils_1.isValidVarName(key)) {
                throw new Error(`"${key}" 不是一个有效 JavaScript 变量名`);
            }
            return key.substr(0, 2) + key[2].toUpperCase() + key.substr(3);
        }
    }
    return lodash_1.camelCase(key);
}
//# sourceMappingURL=wxml.js.map