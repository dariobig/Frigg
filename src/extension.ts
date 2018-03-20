'use strict';

import {workspace, window, commands, ExtensionContext, Disposable, QuickPickOptions, Uri, SaveDialogOptions} from 'vscode';
import Params from './params';
import ReplacementProvider from './replacementProvider';

export function activate(context: ExtensionContext) {

    const replacementProvider = new ReplacementProvider();

    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(ReplacementProvider.scheme, replacementProvider)
    );

    const replaceAEtherParams = commands.registerTextEditorCommand('extension.replaceParameters', editor => {
        let docUri = editor.document.uri;
        // TODO: async
        let params = new Params(editor.document);

        askForFile(getDefaultParamsFile(params), params.discoverParamatersFiles()).then((selected) => {
            if (selected === undefined) {
                return;
            }
            
            if (!params.tryUpdateParams(selected)) {
                window.showInformationMessage(`Generating parameter value file from ${selected}\n`+
                                              'Please add any replacement to the value file.');
                params.saveParams(selected).then(p => {
                    setDefaultParamsFile(docUri, p.fsPath);
                    return workspace.openTextDocument(p);
                }).then(doc => window.showTextDocument(doc), err => window.showErrorMessage(err));
            } else {
                params.saveParams(selected).then(p => setDefaultParamsFile(docUri, p.fsPath), err => window.showErrorMessage(err));
                const replacementUri = ReplacementProvider.getUri(params);
                workspace.openTextDocument(replacementUri).then(doc => window.showTextDocument(doc), err => window.showErrorMessage(err));
            }
        });
    });

    context.subscriptions.push(
        providerRegistrations,
        replaceAEtherParams,
    );
}

const _paramsFiles = new Map<string, string>();

function getDefaultParamsFile(params: Params): string {
    let d = _paramsFiles.get(params.original.toString());
    return d === undefined ? params.defaultParametersPath() : d;
}

function setDefaultParamsFile(uri: Uri, paramsFilePath: string) {
    _paramsFiles.set(uri.toString(), paramsFilePath);
}

function askForFile(defaultFile: string, 
                    files: Thenable<string[]>,
                    placeHolder: string = 'select a replacement file ...'): Thenable<string|undefined> {
    
    let qpo: QuickPickOptions = {
        placeHolder: placeHolder,
        matchOnDescription: true,
    };
    
    let shouldOpenDialog = 'create a new file ...';
    let options = files.then((files) => {
        files = files.filter(f => f !== defaultFile).concat([shouldOpenDialog]);
        return defaultFile === null ? files : [defaultFile].concat(files);
    });

    return window.showQuickPick(options, qpo).then(function (selected): Thenable<string|undefined> {
        if (selected && selected !== undefined) {
            if (selected === shouldOpenDialog) {
                let sdo: SaveDialogOptions = { defaultUri: Uri.file(defaultFile) };
                return window.showSaveDialog(sdo).then((selected: Uri | undefined) => {
                    if (selected !== undefined) {
                        return selected.fsPath;
                    }
                });
            } else {
                return new Promise((resolve, reject) => resolve(selected));
            }
        }
        return new Promise((resolve, reject) => reject(selected));
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
    _paramsFiles.clear();
}
