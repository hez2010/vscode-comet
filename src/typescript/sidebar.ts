import * as vscode from 'vscode';
import { MobileUtil } from "./util"

export class MobileEmulatorProvider implements vscode.TreeDataProvider<EmulatorItem> {

    constructor(private workspaceRoot: string) {}

    public CURRENT_EMULATOR: EmulatorItem;

    private _onDidChangeTreeData: vscode.EventEmitter<EmulatorItem | undefined> = new vscode.EventEmitter<EmulatorItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<EmulatorItem | undefined> = this._onDidChangeTreeData.event;

    public refresh(item: EmulatorItem = undefined): void {
        this._onDidChangeTreeData.fire(undefined);  // TODO: don't reload everytime (pass in `item`);
    }

    getTreeItem(element: EmulatorItem): vscode.TreeItem | Thenable<vscode.TreeItem> {

        if (this.CURRENT_EMULATOR && element.name == this.CURRENT_EMULATOR.name) {
            element.label = `>>> ${element.label}`;
        }
        return element;
    }

    getChildren(element?: EmulatorItem): vscode.ProviderResult<EmulatorItem[]> {
        return Promise.resolve(this.getEmulatorsAndDevices());
    }

    getParent?(element: EmulatorItem): vscode.ProviderResult<EmulatorItem> {
        throw new Error("Method not implemented.");
    }

    async getEmulatorsAndDevices() : Promise<EmulatorItem[]> {
        var util = new MobileUtil();

        var results = new Array<EmulatorItem>(); 
        var devices = await util.GetDevices(null);

        for (var device of devices) {
            results.push(new EmulatorItem(device.name, device.serial, device.platforms, device.version, device.isEmulator, device.isRunning));
        }

        return results;
    }
}

export class EmulatorItem extends vscode.TreeItem {

    constructor(
        public  name: string,
        serial: string,
        platforms: string[],
        version: string,
        isEmulator: boolean = false,
        isRunning: boolean = false,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None) 
    {
        super(name, collapsibleState);

        this.serial = serial;
        this.isEmulator = isEmulator;
        this.isRunning = isRunning;

        this.platforms = platforms;

        var devem = this.isEmulator;
	
        this.tooltip = `${this.label} (${this.platforms} ${devem})`;
    }

    serial: string;
    isEmulator: boolean;
    isRunning: boolean;
    platforms: string[];

    // description()
    // contextValue = 

}