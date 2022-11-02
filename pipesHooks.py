#!/usr/bin/env python3

import frida
import sys
import os
import re
import argparse
from datetime import datetime

def on_message(msg, _):
    log_msg = ""
    if msg['type'] == 'error':
        log_msg = msg['stack']
    else:
        log_msg = msg['payload']
    stamp = datetime.now().strftime("%y%m%d-%H:%M.%f")[:16]
    print("%s %s" % (stamp, log_msg))

def main(proc, outdir, verbose, colors):
    dir_path = os.path.dirname(os.path.realpath(__file__))
    if outdir:
        outdir = os.path.abspath(outdir)
    else:
        outdir = os.path.join(dir_path, "pipe_files")
    try:
        os.mkdir(outdir)
    except:
        pass
        
    
    sess = frida.attach(proc)
    
    outdirJs = outdir.replace("\\", "\\\\\\\\")
    debugJs = (str(verbose)).lower()
    colorsJs = (str(colors).lower())
    code = open(os.path.join(dir_path, 'pipesHooks.js'), 'r').read()
    code = code.replace("function log(", "function unusedLogFunction(")
    code = code.replace("log(", "send(")
    code = re.sub("OUTDIR = .*", ("OUTDIR = '%s'" % outdirJs), code)
    code = re.sub("DEBUG = .*", ("DEBUG = %s" % debugJs), code)
    code = re.sub("COLORS = .*", ("COLORS = %s" % colorsJs), code)
    
    script = sess.create_script(code)
    script.on('message', on_message)
    print("Loading Frida script. Hit Ctrl+C to exit and keep hooked process running\n")
    script.load()
    sys.stdin.read()
    sess.detach()

if __name__ == '__main__':
    
    ap = argparse.ArgumentParser(description='Hook named pipes communication for given process')
    ap.add_argument('-p', '--pid', dest='pid', help='Process ID of where you want to sniff pipes', required=True, type=int)
    ap.add_argument('-d', '--dir', dest='dir', help='Directory of where you want to store pipe messages too large to print out in console (>200B)', type=str)
    ap.add_argument('-v', '--verbose', dest='verbose', help='Enable verbose mode', default=False, action='store_true')
    ap.add_argument('-n', '--no-color', dest='colors', help='Do not print colors. Useful for default Windows 10 & lower PowerShell window', default=True, action='store_false')
    args = ap.parse_args()

    main(args.pid, args.dir, args.verbose, args.colors)
