'use strict';

import {workspace, window, commands, ExtensionContext, Disposable, QuickPickOptions, Uri, SaveDialogOptions, TextDocument} from 'vscode';
import Params from './params';
import ReplacementProvider from './replacementProvider';
import * as fs from 'fs';

export function activate(context: ExtensionContext) {

    const replacementProvider = new ReplacementProvider();

    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(ReplacementProvider.scheme, replacementProvider)
    );

    const replaceParamsCmd = commands.registerTextEditorCommand('extension.replaceParameters', editor => {
        replaceParams(editor.document);
    });

    const replaceParamsToFileCmd = commands.registerTextEditorCommand('extension.replaceParamsToFile', editor => {
        replaceParams(editor.document, false);
    });

    const buildCommandFromParams = commands.registerTextEditorCommand('extension.buildCommandFromParams', editor => {
        let paramsMap = Params.parseParameters(editor.document.getText());
        if (paramsMap === null) {
            window.showErrorMessage('not a valid parameter file');
        } else {
            window.showInformationMessage(paramsMap.toString());
        }
    });

    context.subscriptions.push(
        providerRegistrations,
        replaceParamsCmd,
        replaceParamsToFileCmd,
        buildCommandFromParams
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

function replaceParams(original: TextDocument, readOnly: boolean = true) {
    let params = new Params(original);
    askForFile(getDefaultParamsFile(params), params.discoverParamatersFiles(), 'select a parameter file to use / create ...').then((selected) => {
        if (selected === undefined) {
            return;
        }
        
        if (!params.tryUpdateParams(selected)) {
            window.showInformationMessage(`Generating parameter value file from ${selected}\n`+
                                          'Please add any replacement to the value file.');
            params.saveParams(selected).then(p => {
                setDefaultParamsFile(original.uri, p.fsPath);
                return workspace.openTextDocument(p);
            }).then(doc => window.showTextDocument(doc), err => window.showErrorMessage(err));
        } else {
            params.saveParams(selected).then(p => setDefaultParamsFile(original.uri, p.fsPath), err => window.showErrorMessage(err));
            const replacementUri = ReplacementProvider.getUri(params);

            if (readOnly) {
                workspace.openTextDocument(replacementUri).then(doc => window.showTextDocument(doc), err => window.showErrorMessage(err));
            } else {
                workspace.openTextDocument(replacementUri).then(doc => {
                    if (doc === undefined || doc === null) {
                        window.showErrorMessage('error replacing document!');
                        return;
                    }

                    askForFile(doc.uri.fsPath, null, 'save replaced file to ...').then(selected => {
                        if (selected === undefined || selected === null) {
                            return;
                        }

                        return fs.writeFile(selected, doc.getText(), 'utf8', (err) => {
                            if (err !== null) {
                                window.showErrorMessage(`Error writing ${selected}: ${err}`);
                            } else {
                                window.showTextDocument(Uri.file(selected));
                            }
                        });}, 
                        err => window.showErrorMessage(err));
                    });
            }
        }
    });
}

function askForFile(defaultFile: string, 
                    files: Thenable<string[]> | null,
                    placeHolder: string): Thenable<string|undefined> {
    
    let qpo: QuickPickOptions = {
        placeHolder: placeHolder,
        matchOnDescription: true,
    };
    
    let shouldOpenDialog = 'pick a file ...';
    let options: Thenable<string[]> | string[];
    if (files === null) {
        options = defaultFile === null ? [shouldOpenDialog] : [defaultFile, shouldOpenDialog];
    } else {
        options = files.then((files) => {
            files = files.filter(f => f !== defaultFile).concat([shouldOpenDialog]);
            return defaultFile === null ? files : [defaultFile].concat(files);
        });
    }

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
        return new Promise((resolve, reject) => reject());
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
    _paramsFiles.clear();
}
