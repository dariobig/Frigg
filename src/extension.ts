'use strict';

import {workspace, window, commands, ExtensionContext, Disposable, QuickPickOptions, OpenDialogOptions, Uri} from 'vscode';
import Params from './params';
import ReplacementProvider from './replacementProvider';

export function activate(context: ExtensionContext) {

    const replacementProvider = new ReplacementProvider();

    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(ReplacementProvider.scheme, replacementProvider)
    );

    const replaceAEtherParams = commands.registerTextEditorCommand('extension.replaceParameters', editor => {
        let uri = editor.document.uri;
        var params = new Params(editor.document);

        // ask for parameter file
        // load and merge params
        // save back to file
        askForFile(params.discoverParamatersFiles(), "select or type a parameter file ... ").then((selected) => {
            if (selected !== undefined) {
                if (!params.tryUpdateParams(selected)) {
                    window.showInformationMessage(`Generating parameter value file from ${selected}\nPlease add any replacement to the value file.`);
                    params.saveParams(selected).then(uri => workspace.openTextDocument(uri)).then(doc => window.showTextDocument(doc));
                } else {
                    params.saveParams(params.defaultParametersPath());
                    const replacementUri = ReplacementProvider.getUri(uri, params.getParams());
                    workspace.openTextDocument(replacementUri).then(doc => window.showTextDocument(doc));
                }
            }
        });
    });

    context.subscriptions.push(
        providerRegistrations,
        replaceAEtherParams,
    );
}

function askForFile(files: Thenable<string[]>, placeHolder: string = 'select / type a filename ...'): Thenable<string|undefined> {
    let qpo: QuickPickOptions = {  
        placeHolder: placeHolder,
        matchOnDescription: true,
    };
    
    let shouldOpenDialog = 'or pick a file ...';
    let options = files.then((files) => files.concat([shouldOpenDialog]));

    return window.showQuickPick(options, qpo).then(function (selected): Thenable<string|undefined> {
        if (selected && selected !== undefined) {
            if (selected === shouldOpenDialog) {
                let odo: OpenDialogOptions = {
                    canSelectFolders: false,
                    canSelectFiles: true,
                    canSelectMany: false
                };

                return window.showOpenDialog(odo).then((selected: Uri[] | undefined) => {
                    if (selected !== undefined && selected.length > 0) {
                        return selected[0].fsPath;
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
}