/*
Copyright 2016 Daniel Betz

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// XPCOM imports
const {Cc, Ci, Cu} = require("chrome");

const browserHistory = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsIBrowserHistory);
const historyService = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsINavHistoryService);

const observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

// Imports for Downloads.jsm & Task.jsm
const {Downloads} = Cu.import("resource://gre/modules/Downloads.jsm", {});
const {Task} = Cu.import("resource://gre/modules/Task.jsm", {});

// Addon SDK imports
const prefService = require("sdk/simple-prefs");
const timers = require("sdk/timers");

// Easy/strong access to settings.
const prefNames = {
  "clearOnExit": "clearOnExit",
  "clearOnDownload": "clearOnDownload",
  "clearDelay": "clearDelay"
};

let executeTimeouts = false;

// Download list instance
let downloadList;

// Listener for "quitting" event - Places database is still available at this point. Implements nsIObserver.
let quitListener = {
  "observe": function (sender, evType, evData)
  {
    if (prefService.prefs.clearOnExit)
    {
      emptyDownloadsHistory();
    }
  }
};

// Handle downloads, new and changed
function onDownloadChanged(download)
{
  // Only act on not-in-progress downloads
  if (download.succeeded || (download.canceled && download.stopped))
  {
    // Finalize download, just because.
    download.finalize().then(function ()
    {
      // Remove from history and download list
      timers.setTimeout(removeDownloadEntry.bind(download), prefService.prefs.clearDelay * 1000);
    }).then(null, reportError);
  }
}

// Listener for download manager events -- some downloads are finished before even being added!
let downloadListener = {
  "onDownloadAdded": onDownloadChanged,
  "onDownloadChanged": onDownloadChanged
};

// Wrapper for Components.utils.reportError - used for development.
function reportError(e)
{
  // Cu.reportError(e);
}

// Remove history entry "this".
function removeDownloadEntry()
{
  if (!executeTimeouts)
  {
    return;
  }

  // Remove download from Downloads.jsm list
  downloadList.remove(this);

  try
  {
    let downloadUri = ioService.newURI(this.source.url, null, null);
    browserHistory.removePage(downloadUri);
  }
  catch (removeEx)
  { }
}

// Does the actual deleting.
function emptyDownloadsHistory()
{
  let queryResult, uriList;

  // Remove downloads from Downloads.jsm list
  downloadList.removeFinished();

  try
  {
    // Generate query for download transition.
    let options = historyService.getNewQueryOptions();
    let query = historyService.getNewQuery();

    query.setTransitions([ historyService.TRANSITION_DOWNLOAD ], 1);

    // Execute query.
    queryResult = historyService.executeQuery(query, options);
  }
  catch (queryEx)
  {
    return;
  }

  try
  {
    // Array to store nsIURIs for deletion.
    uriList = [];

    // Open and iterate results - they are "flat", no need for anything fancy.
    let rootNode = queryResult.root;
    rootNode.containerOpen = true;

    for (let i = 0; i < rootNode.childCount; i++)
    {
      // Create real nsIURI from string and collect it.
      let entryUri = ioService.newURI(rootNode.getChild(i).uri, null, null);
      uriList.push(entryUri);
    }

    rootNode.containerOpen = false;
  }
  catch (iterateEx)
  {
    return;
  }

  try
  {
    if (uriList.length > 10)
    {
      // Bulk delete everything.
      browserHistory.removePages(uriList, uriList.length);
    }
    else
    {
      // Single delete to keep overhead low.
      for (let i = 0; i < uriList.length; i++)
      {
        browserHistory.removePage(uriList[i]);
      }
    }
  }
  catch (deleteEx)
  {
    return;
  }
}

// Executed when a user preference changes.
function prefChanged(prefName)
{
  if (prefName === prefNames.clearOnDownload)
  {
    if (prefService.prefs.clearOnDownload)
    {
      downloadList.addView(downloadListener);
    }
    else
    {
      downloadList.removeView(downloadListener);
    }
  }
}

// Executed when this module is the main module in an extension that has just been loaded.
exports.main = function (options, callback)
{
  Task.spawn(function ()
  {
    // Listen for "quitting" event.
    observerService.addObserver(quitListener, "quit-application-granted", false);

    // Enable timeout callbacks
    executeTimeouts = true;

    // Prepare download manager list
    downloadList = yield Downloads.getList(Downloads.ALL);

    // Apply settings and observe changes.
    for (let name in prefNames)
    {
      if (prefNames.hasOwnProperty(name))
      {
        prefService.on(name, prefChanged);
        prefChanged(name);
      }
    }

    // Listen for on-demand button
    prefService.on("clearNow", emptyDownloadsHistory);
  }).then(null, reportError);
};

// Executed when this module is a loaded extension that is about to be unloaded.
exports.onUnload = function (reason)
{
  // Stop timeout callbacks from continuing.
  executeTimeouts = false;

  // Remove event listener.
  observerService.removeObserver(quitListener, "quit-application-granted");

  // Remove download listener
  downloadList.removeView(downloadListener);

  // Remove all setting listeners as well.
  prefService.removeListener("clearNow", emptyDownloadsHistory);

  for (let name in prefNames)
  {
    if (prefNames.hasOwnProperty(name))
    {
      prefService.removeListener(name, prefChanged);
    }
  }
};
