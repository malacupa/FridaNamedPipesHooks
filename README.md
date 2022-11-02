## Frida Named Pipes Hooks
This is a Frida script and it's Python convenience wrapper for hooking Windows API functions used during named pipe communication. You can use it for simple sniffing on named pipe messages in target process. It's all in user mode without any kernel drivers.

You can also use JavaScript code as boilerplate for easy tampering with named pipe messages.

## Usage - Basic
Use Python version to get better logging.

```
PS > py .\pipeHooks.py --help
usage: pipeHook.py [-h] -p PID [-d DIR] [-v] [-n]

Hook named pipes communication for given process

options:
  -h, --help         show this help message and exit
  -p PID, --pid PID  Process ID of where you want to sniff pipes
  -d DIR, --dir DIR  Directory of where you want to store pipe messages too large to print out in console (>200B)
  -v, --verbose      Enable verbose mode
  -n, --no-color     Do not print colors. Useful for default Windows 10 & lower PowerShell window
```

Example usage:
![Example basic usage](https://github.com/malacupa/FridaNamedPipesHooks/blob/main/img/example-py.jpg?raw=true)

## Usage - Advanced
Use JavaScript instead of Python script. It is useful when debugging as Frida automatically reloads changes to JS file.

```
# consider you many not have frida.exe in path, it may be e.g. here C:\Python311\Scripts\frida.exe
PS > frida.exe --load .\pipeHooks.js --attach-pid <target pid>
```

Example usage:
![Example basic usage](https://github.com/malacupa/FridaNamedPipesHooks/blob/main/img/example-js.jpg?raw=true)

## Installation
You should have Python 3 and Frida installed. Install manually or use following steps (as admin):

```
# install Chocolatey to install Python 3 easily
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# install Python
choco install python

# install Frida Python library and frida.exe
py -m pip install frida frida-tools

# download & unpack this repo
Invoke-WebRequest https://github.com/malacupa/FridaNamedPipeHooks/archive/refs/heads/main.zip -outfile FridaNamedPipeHooks.zip
Expand-Archive FridaNamedPipeHooks.zip -DestinationPath C:\
```

## Limitations

  * When the process you connect to is not calling CreateNamedPipe API you will only see messages sent/received on handle and not readable name
	* You can't hook lsass and similar as Frida runs in usermode and PPL processes can't be hooked from that perspective
	* Sometimes you get access denied errors or won't be able to start Frida at all even if you run as SYSTEM and don't hook PPL, not sure why yet

## Alternative tools

  * [NamedPipeCapture](https://github.com/Vatyx/NamedPipeCapture). Uses Wireshark.
	* [NpEtw](https://github.com/kobykahane/NpEtw). Uses unsigned kernel driver & allows viewing messages via ETW
	* [API Monitor](http://www.rohitab.com/apimonitor). Allows you to hook selected functions similarly as Frida.
	* [IO Ninja](https://ioninja.com/plugins/pipe-monitor.html). Nice GUI but named pipes features costs a little $$.
	* [Mario & Luigi](https://github.com/OmerYa/Named-Pipe-Sniffer) ???
