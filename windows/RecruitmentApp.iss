#define AppName "RecruitmentApp"
#define AppVersion "1.0.0"
#define AppPublisher "RecruitmentApp"

[Setup]
AppId={{A8CF3A25-01A8-4B5A-949D-2CC6DA67E39B}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
OutputDir=..\dist-installer
OutputBaseFilename=RecruitmentApp-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\RecruitmentAppLauncher.exe

[Dirs]
Name: "C:\RecruitmentApp\Data"; Permissions: users-modify
Name: "C:\RecruitmentApp\Data\CVs"; Permissions: users-modify

[Files]
Source: "..\build\windows\server\RecruitmentAppServer\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist\*"; DestDir: "{app}\server\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\build\windows\launcher\RecruitmentAppLauncher.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\RecruitmentAppLauncher.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\RecruitmentAppLauncher.exe"

[Run]
Filename: "{app}\RecruitmentAppLauncher.exe"; Description: "Launch {#AppName}"; Flags: postinstall nowait skipifsilent
