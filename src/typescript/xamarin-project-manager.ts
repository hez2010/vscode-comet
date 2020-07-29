import { MSBuildProject, TargetFramework } from "./omnisharp/protocol";
import * as vscode from 'vscode';
import { BaseEvent, WorkspaceInformationUpdated } from './omnisharp/loggingEvents';
import { EventType } from './omnisharp/EventType';
import { MsBuildProjectAnalyzer } from './msbuild-project-analyzer';
import { DeviceData, XamarinUtil, SimCtlDevice } from "./xamarin-util";

let fs = require('fs');

export class MSBuildProjectInfo implements MSBuildProject {
	public static async fromProject(project: MSBuildProject): Promise<MSBuildProjectInfo> {
		var r = new MSBuildProjectInfo();

		r.ProjectGuid = project.ProjectGuid;
		r.Path = project.Path;
		r.AssemblyName = project.AssemblyName;
		r.TargetPath = project.TargetPath;
		r.TargetFramework = project.TargetFramework;
		r.SourceFiles = project.SourceFiles;
		r.TargetFrameworks = project.TargetFrameworks;
		r.OutputPath = project.OutputPath;
		r.IsExe = project.IsExe;
		r.IsUnityProject = project.IsUnityProject;

		var projXml = fs.readFileSync(r.Path);
		var msbpa = new MsBuildProjectAnalyzer(projXml);
		await msbpa.analyze();

		r.Configurations = msbpa.getConfigurationNames();
		r.Platforms = msbpa.getPlatformNames();
		r.Name = msbpa.getProjectName();
		return r;
	}

	Name: string;
	ProjectGuid: string;
	Path: string;
	AssemblyName: string;
	TargetPath: string;
	TargetFramework: string;
	SourceFiles: string[];
	TargetFrameworks: TargetFramework[];
	OutputPath: string;
	IsExe: boolean;
	IsUnityProject: boolean;

	Configurations: string[];
	Platforms: string[];
}

export class XamarinProjectManager {
	static SelectedProject: MSBuildProjectInfo;
	static SelectedProjectConfiguration: string;
	static SelectedTargetFramework: string;
	static SelectedDevice: DeviceData;
	static Devices: DeviceData[];

	omnisharp: any;

	constructor(context: vscode.ExtensionContext) {
		this.omnisharp = vscode.extensions.getExtension("ms-dotnettools.csharp").exports;

		this.omnisharp.eventStream.subscribe(async (e: BaseEvent) => {
			if (e.type === EventType.WorkspaceInformationUpdated) {

				this.StartupProjects = new Array<MSBuildProjectInfo>();

				for (var p of (<WorkspaceInformationUpdated>e).info.MsBuild.Projects) {
					if (p.TargetFramework.startsWith("MonoAndroid") || p.TargetFramework.startsWith("Xamarin")) {
						this.StartupProjects.push(await MSBuildProjectInfo.fromProject(p));
					}
				}
			}
		});

		context.subscriptions.push(vscode.commands.registerCommand("xamarin.selectProject", this.showProjectPicker, this));
		context.subscriptions.push(vscode.commands.registerCommand("xamarin.selectDevice", this.showDevicePicker, this));

		this.projectStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.projectStatusBarItem.tooltip = "Select a Startup Project";
		this.projectStatusBarItem.text = "$(project) Startup Project";

		this.deviceStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.deviceStatusBarItem.tooltip = "Select a Device";
		this.deviceStatusBarItem.text = "$(device-mobile) Device";

		this.updateProjectStatus();
		this.updateDeviceStatus();
	}

	projectStatusBarItem: vscode.StatusBarItem;
	deviceStatusBarItem: vscode.StatusBarItem;

	public StartupProjects = new Array<MSBuildProjectInfo>();

	public async showProjectPicker(): Promise<void> {
		var projects = this.StartupProjects
			.map(x => ({
				//description: x.type.toString(),
				label: x.AssemblyName,
				project: x,
			}));
		const p = await vscode.window.showQuickPick(projects, { placeHolder: "Select a Startup Project" });
		if (p) {

			if (p.project.TargetFrameworks && p.project.TargetFrameworks.length > 0) {
				// Multi targeted app, ask the user which TFM to startup
				var tfms = p.project.TargetFrameworks
					.map(x => ({
						label: x.FriendlyName,
						tfm: x
					}));


				const tfm = await vscode.window.showQuickPick(tfms, { placeHolder: "Target Framework" });
				if (tfm)
					XamarinProjectManager.SelectedTargetFramework = tfm.tfm.Name;
				else
					XamarinProjectManager.SelectedTargetFramework = p.project.TargetFramework;
			}
			else {
				// Not multi targeted, don't need to ask the user
				XamarinProjectManager.SelectedTargetFramework = p.project.TargetFramework;
			}

			const c = await vscode.window.showQuickPick(p.project.Configurations, { placeHolder: "Build Configuration" });
			if (c) {
				XamarinProjectManager.SelectedProject = p.project;
				XamarinProjectManager.SelectedProjectConfiguration = c;
				XamarinProjectManager.SelectedDevice = undefined;
			}
		}
		this.updateProjectStatus();
		this.updateDeviceStatus();
	}

	public async updateProjectStatus() {
		var projectString = XamarinProjectManager.SelectedProject === undefined ? "Startup Project" : `${XamarinProjectManager.SelectedProject.Name} | ${XamarinProjectManager.SelectedProjectConfiguration}`;
		this.projectStatusBarItem.text = "$(project) " + projectString;
		this.projectStatusBarItem.tooltip = XamarinProjectManager.SelectedProject === undefined ? "Select a Startup Project" : XamarinProjectManager.SelectedProject.Path;
		this.projectStatusBarItem.command = "xamarin.selectProject";
		this.projectStatusBarItem.show();
	}


	public async showDevicePicker(): Promise<void> {

		if (XamarinProjectManager.SelectedProject === undefined) {
			await vscode.window.showInformationMessage("Select a Startup Project first.");
			return;
		}

		var tfm = XamarinProjectManager.SelectedTargetFramework;

		if (!tfm) {
			XamarinProjectManager.Devices = [];
		}
		else {
			var util = new XamarinUtil();

			var tfmlc = tfm.toLowerCase();

			if (tfmlc.indexOf('monoandroid') >= 0 || tfmlc.indexOf('-android') >= 0) {
				var androidDevices = await util.GetAndroidDevices();

				var androidPickerDevices = androidDevices
					.map(x => ({
						//description: x.type.toString(),
						label: x.name,
						device: x,
					}));

				const p = await vscode.window.showQuickPick(androidPickerDevices, { placeHolder: "Select a Device" });
				if (p) {
					XamarinProjectManager.SelectedDevice = p.device;
				}
			}
			else if (tfmlc.indexOf('xamarin.ios') >= 0 || tfmlc.indexOf('xamarinios') >= 0 || tfmlc.indexOf('-ios') >= 0) {
				var iosDevices = await util.GetiOSDevices();

				var iosPickerDevices = iosDevices.devices
					.map(x => ({
						//description: x.type.toString(),
						label: x.name,
						device: x,
						devices: null as SimCtlDevice[]
					}))
					.concat(iosDevices.simulators
						.map(y => ({
							label: y.name,
							device: null,
							devices: y.devices
						})));

				const p = await vscode.window.showQuickPick(iosPickerDevices, { placeHolder: "Select a Device" });
				if (p) {
					if (p.device)
						XamarinProjectManager.SelectedDevice = p.device;
					else {
						var devicePickerItems = p.devices
							.map(z => ({
								label: z.runtime.name,
								device: z
							}));
						const d = await vscode.window.showQuickPick(devicePickerItems, { placeHolder: "Select a Runtime Version" });
						if (d) {
							var deviceData = new DeviceData();
							deviceData.name = d.device.name + ' | ' + d.device.runtime.name;
							deviceData.iosSimulatorDevice = d.device;
							deviceData.isEmulator = true;
							deviceData.isRunning = false;
							deviceData.platform = 'ios';
							deviceData.serial = d.device.udid;
							deviceData.version = d.device.runtime.version;

							XamarinProjectManager.SelectedDevice = deviceData;
						}
					}
				}
			}
		}

		this.updateDeviceStatus();
	}

	public async updateDeviceStatus() {
		var deviceStr = XamarinProjectManager.SelectedDevice === undefined ? "Select a Device" : `${XamarinProjectManager.SelectedDevice.name}`;
		this.deviceStatusBarItem.text = "$(device-mobile) " + deviceStr;
		this.deviceStatusBarItem.tooltip = XamarinProjectManager.SelectedProject === undefined ? "Select a Device" : XamarinProjectManager.SelectedDevice.name;
		this.deviceStatusBarItem.command = "xamarin.selectDevice";
		this.deviceStatusBarItem.show();
	}
}