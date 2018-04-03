'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import Params, {ParamsMap, Param} from './params';
import { replaceAll } from './utils';

export default class ReplacementProvider implements vscode.TextDocumentContentProvider {
    static scheme = 'frigg';

    public provideTextDocumentContent(uri: vscode.Uri): string {
        let [paramsMap, paramsFile] = decodeParams(uri);
        return this.replaceParams(uri.path, paramsFile, paramsMap);
    }

    static getUri(params: Params): vscode.Uri {
        let now = new Date().getMilliseconds().toString();
        let jsParams = JSON.stringify(params.getParams());
        let original = params.lastParamFile !== null ? params.lastParamFile : '';
        const query = JSON.stringify([jsParams, original, now]);
        return vscode.Uri.parse(`${ReplacementProvider.scheme}:${localScriptPath(params.original)}?${query}`);
    }

    private replaceParams(original: string, paramsFile: string|null, paramsMap: ParamsMap): string {
        let editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            return "// ERROR: No active editor found!";
        }

        var replaced = editor.document.getText();
        var header = `// REPLACED: ${original}\n`;
        
        if (paramsFile !== null) {
            header += `// PARAMS: ${paramsFile}\n`;
        }

        for (let key in paramsMap) {
            let value = Param.getValue(paramsMap[key]);
            header += `// ${key}: ${value === '' ? '-- NOTHING --' : value}\n`;
            replaced = replaceAll(replaced, key, value);
        }

        return `${header}\n${replaced}`;
    }
}

function decodeParams(uri: vscode.Uri): [ParamsMap, string|null] {
    let [mapStr, paramsFile,] = JSON.parse(uri.query) as [string, string, string];
    return [JSON.parse(mapStr), paramsFile === '' ? null : paramsFile];
}

function localScriptPath(original: vscode.Uri): string {
    let p = path.parse(original.fsPath);
    return `${path.join(p.dir, p.name)}.local${p.ext}`;
}
