'use strict';

import * as fs from 'fs';
import * as path from 'path';
import {homedir} from 'os';
import {workspace, window, commands, ExtensionContext, Disposable, QuickPickOptions, Uri, TextDocument, TextEditor, ViewColumn} from 'vscode';
import Params, {validateParamsMap, ParamsMap} from './params';
import ReplacementProvider from './replacementProvider';
import InterfaceBuilder from './interfaceBuilder';
import {mkDirRecursive} from './utils';


export function activate(context: ExtensionContext) {

    const replacementProvider = new ReplacementProvider();

    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(ReplacementProvider.scheme, replacementProvider)
    );

    const replaceParamsCmd = commands.registerTextEditorCommand('extension.replaceParameters', editor => {
        replaceParams(editor.document, nextColumn(editor));
    });

    const replaceParamsToFileCmd = commands.registerTextEditorCommand('extension.replaceParamsToFile', editor => {
        replaceParams(editor.document, nextColumn(editor), false);
    });

    const generateScriptFromParamsCmd = commands.registerTextEditorCommand('extension.generateScriptFromParams', editor => {
        let paramsMap = validateParamsMap(Params.parseParameters(editor.document.getText()));
        if (paramsMap === null) {
            window.showErrorMessage('not a valid parameter file');
            return;
        }

        let paramsFsPath = editor.document.uri.fsPath;
        askForFile(getDefaultTemplateFile(paramsFsPath), discoverTemplateFiles(), 'please select a template file ...', false).then(templateFile => {
            if (templateFile === undefined) {
                return;
            }

            let column = nextColumn(editor);
            fs.exists(templateFile, exists => {
                if (!exists) {
                    mkDirRecursive(templateFile);
                    fs.writeFile(templateFile, JSON.stringify(InterfaceBuilder.getDefaultConfig(), null, 2), (err) => {
                        if (err !== null) {
                            window.showErrorMessage(`can't write to template file ${templateFile}: ${err}`);
                            return;
                        }
                    });
                    workspace.openTextDocument(templateFile).then(doc => window.showTextDocument(doc, column));
                    return;
                }

                fs.readFile(templateFile, 'utf8', (err, data) => {
                    if (err !== null) {
                        window.showErrorMessage(`can't read template file ${templateFile}`);
                        return;
                    }
                    
                    let cmd = InterfaceBuilder.build(data, paramsMap as ParamsMap);
                    if (cmd === null) {
                        window.showErrorMessage(`can't parse rule file ${templateFile}`);
                        return;
                    }
               
                    // Remember template file
                    _templateFiles.set(paramsFsPath, templateFile);
    
                    let knownCmdFiles: Thenable<string[]> = new Promise((resolve, reject) => resolve([..._cmdFiles.values()]));
                    let suggestedCmdName = _cmdFiles.get(paramsFsPath);
                    if (suggestedCmdName === undefined) {
                        let paramsPath = path.parse(editor.document.uri.fsPath);
                        let rulesPath = path.parse(templateFile);
                        suggestedCmdName = path.join(paramsPath.dir, `${paramsPath.name}.${rulesPath.name}.txt`);
                    }
    
                    askForFile(suggestedCmdName, knownCmdFiles, 'please pick an output file ...').then((cmdFile) => {
                        if (cmdFile === undefined) {
                            return;
                        }
    
                        fs.writeFile(cmdFile, cmd, 'utf8', (err) => {
                            if (err !== null) {
                                window.showErrorMessage(`can't write command file ${cmdFile}`);
                                return;
                            }
    
                            return workspace.openTextDocument(cmdFile).then(doc => {
                                if (doc === undefined) {
                                    window.showErrorMessage(`something went wrong opening ${cmdFile}`);
                                    return;
                                }
    
                                // Remember cmd file
                                _cmdFiles.set(paramsFsPath, cmdFile);
                                window.showTextDocument(doc, column);
                            });
                        });
                    });
                });
            });
        });
    });

    context.subscriptions.push(
        providerRegistrations,
        replaceParamsCmd,
        replaceParamsToFileCmd,
        generateScriptFromParamsCmd
    );
}

const _paramsFiles = new Map<string, string>();
const _templateFiles = new Map<string, string>();
const _cmdFiles = new Map<string, string>();

function resolvePath(p: string): string {
    return p.startsWith('~') ? path.join(homedir(), path.normalize(p.replace(/^~[\/\\]/, ''))) : path.normalize(p);
}

function getDefaultParamsFile(params: Params): string {
    let d = _paramsFiles.get(params.original.toString());
    return d === undefined ? params.defaultParametersPath() : d;
}

function getDefaultTemplateFile(paramsFsPath: string): string {
    let d = _templateFiles.get(paramsFsPath);
    if (d !== undefined) {
        return d;
    }

    let folder: string | undefined = workspace.getConfiguration('frigg', null).get('templateFolder');
    return path.join(resolvePath(folder === undefined ? '~' : folder), 'template.json');
}

function discoverTemplateFiles(): Thenable<string[]> {
    let templates: Thenable<string[]> = new Promise((resolve, reject) => resolve([..._templateFiles.values()]));
    return templates.then(files => {
        if (files === undefined || files === null) {
            files = [];
        }

        let templateFolder: string | undefined = workspace.getConfiguration('frigg', null).get('templateFolder');
        if (templateFolder === undefined) {
            return files;
        } else {
            let folderPath = resolvePath(templateFolder);
            return new Promise<string[]>((resolve, reject) => fs.readdir(folderPath, (err, moreFiles) => {
                if (err !== null && moreFiles !== undefined) {
                    let jsonFiles = moreFiles.filter(f => f.endsWith('.json'));
                    resolve(files.concat(jsonFiles.map(f => path.join(folderPath, f))));
                }
                resolve(files);
            }));
        }
    });
}

function nextColumn(editor: TextEditor): number {
    return editor.viewColumn === undefined ? 1 : Math.min(editor.viewColumn + 1, 2);
}

function setDefaultParamsFile(uri: Uri, paramsFilePath: string) {
    _paramsFiles.set(uri.toString(), paramsFilePath);
}

function replaceParams(original: TextDocument, column: ViewColumn, readOnly: boolean = true) {
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
            }).then(doc => window.showTextDocument(doc, column), err => window.showErrorMessage(err));
        } else {
            params.saveParams(selected).then(p => setDefaultParamsFile(original.uri, p.fsPath), err => window.showErrorMessage(err));
            const replacementUri = ReplacementProvider.getUri(params);

            if (readOnly) {
                workspace.openTextDocument(replacementUri).then(doc => window.showTextDocument(doc, column), err => window.showErrorMessage(err));
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

function askForFile(defaultFile: string | undefined,
                    files: Thenable<string[]> | null,
                    placeHolder: string,
                    overWritePick: boolean = true): Thenable<string|undefined> {
    
    let qpo: QuickPickOptions = {
        placeHolder: placeHolder,
        matchOnDescription: true,
    };
    
    let shouldOpenDialog = 'pick a file ...';
    let options: Thenable<string[]> | string[];
    if (files === null) {
        options = defaultFile === undefined ? [shouldOpenDialog] : [defaultFile, shouldOpenDialog];
    } else {
        options = files.then((files) => {
            files = files.filter(f => f !== defaultFile).concat([shouldOpenDialog]);
            return defaultFile === undefined ? files : [defaultFile].concat(files);
        });
    }

    return window.showQuickPick(options, qpo).then(selected => {
        if (selected && selected !== undefined) {
            if (selected === shouldOpenDialog) {
                let dialogOptions = { 
                    defaultUri: defaultFile !== undefined ? Uri.file(defaultFile) : undefined,
                    canSelectFiles: false,
                    canSelectFolders: false,
                    canSelectMany: false
                };

                if (overWritePick) {
                    return window.showSaveDialog(dialogOptions).then(selectedUri => {
                        if (selectedUri !== undefined) {
                            return selectedUri.fsPath;
                        }
                    });
                } else {
                    return window.showOpenDialog(dialogOptions).then(selectedUris => {
                        if (selectedUris !== undefined && selectedUris.length === 1) {
                            return selectedUris[0].fsPath;
                        }
                    });
                }
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
    _templateFiles.clear();
    _cmdFiles.clear();
}
