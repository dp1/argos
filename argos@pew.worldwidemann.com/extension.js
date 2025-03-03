/*
 * Argos - Create GNOME Shell extensions in seconds
 *
 * Copyright (c) 2016-2018 Philipp Emanuel Weidmann <pew@worldwidemann.com>
 *
 * Nemo vir est qui mundum non reddat meliorem.
 *
 * Released under the terms of the GNU General Public License, version 3
 * (https://gnu.org/licenses/gpl.html)
 */

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ArgosButton } from './button.js';
import * as Utilities from './utilities.js';

let directory;
let directoryMonitor;
let directoryChangedId;
let debounceTimeout = null;
let buttons = [];

function init() {
  let directoryPath = GLib.build_filenamev([GLib.get_user_config_dir(), "argos"]);

  directory = Gio.File.new_for_path(directoryPath);

  if (!directory.query_exists(null)) {
    directory.make_directory(null);

    // Create "welcome" script on first run to indicate
    // that the extension is installed and working
    let scriptPath = GLib.build_filenamev([directoryPath, "argos.sh"]);

    let scriptContents =
      '#!/usr/bin/env bash\n\n' +
      'URL="github.com/p-e-w/argos"\n' +
      'DIR=$(dirname "$0")\n\n' +
      'echo "Argos"\n' +
      'echo "---"\n' +
      'echo "$URL | iconName=help-faq-symbolic href=\'https://$URL\'"\n' +
      'echo "$DIR | iconName=folder-symbolic href=\'file://$DIR\'"\n\n';

    GLib.file_set_contents(scriptPath, scriptContents);

    // Running an external program just to make a file executable is ugly,
    // but Gjs appears to be missing bindings for the "chmod" syscall
    GLib.spawn_sync(null, ["chmod", "+x", scriptPath], null, GLib.SpawnFlags.SEARCH_PATH, null);
  }

  // WATCH_MOVES requires GLib 2.46 or later
  let monitorFlags = Gio.FileMonitorFlags.hasOwnProperty("WATCH_MOVES") ?
    Gio.FileMonitorFlags.WATCH_MOVES : Gio.FileMonitorFlags.SEND_MOVED;
  directoryMonitor = directory.monitor_directory(monitorFlags, null);
}

function enable() {
  addButtons();

  directoryChangedId = directoryMonitor.connect("changed", function(monitor, file, otherFile, eventType) {
    removeButtons();

    // Some high-level file operations trigger multiple "changed" events in rapid succession.
    // Debouncing groups them together to avoid unnecessary updates.
    if (debounceTimeout === null) {
      debounceTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 100, function() {
        debounceTimeout = null;
        addButtons();
        return false;
      });
    }
  });
}

function disable() {
  directoryMonitor.disconnect(directoryChangedId);

  if (debounceTimeout !== null)
    GLib.source_remove(debounceTimeout);

  removeButtons();
}

function addButtons() {
  let files = [];

  let enumerator = directory.enumerate_children(Gio.FILE_ATTRIBUTE_STANDARD_NAME, Gio.FileQueryInfoFlags.NONE, null);

  let fileInfo = null;
  while ((fileInfo = enumerator.next_file(null)) !== null) {
    let file = enumerator.get_child(fileInfo);

    if (GLib.file_test(file.get_path(), GLib.FileTest.IS_EXECUTABLE) &&
      !GLib.file_test(file.get_path(), GLib.FileTest.IS_DIR) &&
      !file.get_basename().startsWith(".")) {
      files.push(file);
    }
  }

  files.sort(function(file1, file2) {
    return file1.get_basename().localeCompare(file2.get_basename());
  });

  // Iterate in reverse order as buttons are added right-to-left
  for (let i = files.length - 1; i >= 0; i--) {
    let settings = Utilities.parseFilename(files[i].get_basename());
    let button = new ArgosButton(files[i], settings);
    buttons.push(button);
    Main.panel.addToStatusArea("argos-button-" + i, button, settings.position, settings.box);
  }
}

function removeButtons() {
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].destroy();
  }
  buttons = [];
}

export default class ArgosExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    init();
  }

  enable() {
    enable();
  }

  disable() {
    disable();
  }
}
