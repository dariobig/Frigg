'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import {ParamsMap, Param} from './params';

export default class ReplacementProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'frigg';

    public provideTextDocumentContent(uri: vscode.Uri): string {
        let paramsMap = decodeParams(uri);
        return this.replaceParams(uri.path, paramsMap);
    }

    static getUri(original: vscode.Uri, paramsMap: ParamsMap): vscode.Uri {
        const query = JSON.stringify(JSON.stringify(paramsMap));
        return vscode.Uri.parse(`${ReplacementProvider.scheme}:${localScriptPath(original)}?${query}`);
    }

    private replaceParams(original: string, paramsMap: ParamsMap): string {
        let editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            return "// ERROR: No active editor found!";
        }

        var replaced = editor.document.getText();
        var header = `// REPLACED: ${original}\n`;
        for (let key in paramsMap) {
            let value = Param.getValue(paramsMap[key]);
            header += `// ${key}: ${value === '' ? '-- NOTHING --' : value}\n`;
            replaced = replaced.replace(key, value);
        }

        return `${header}\n${replaced}`;
    }
}

function decodeParams(uri: vscode.Uri): ParamsMap {
    return <ParamsMap>JSON.parse(<string>JSON.parse(uri.query));
}

function localScriptPath(original: vscode.Uri): string {
    let p = path.parse(original.fsPath);
    return `${path.join(p.dir, p.name)}.local${p.ext}`;
}
