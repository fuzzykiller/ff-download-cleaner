/*
Copyright 2013 Daniel Betz

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
var {Cc, Ci} = require("chrome");

var browserHistory = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsIBrowserHistory);
var historyService = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsINavHistoryService);
var asyncHistory = Cc["@mozilla.org/browser/history;1"].getService(Ci.mozIAsyncHistory);

var downloadManager = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);

var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

// Addon SDK imports
var prefService = require("simple-prefs");
var timers = require("timers");

// Easy/strong access to settings.
var prefNames = {
  "clearOnExit": "clearOnExit",
  "clearOnDownload": "clearOnDownload",
  "clearDelay": "clearDelay"
};

var executeTimeouts = false;

// Listener for "quitting" event - Places database is still available at this point. Implements nsIObserver.
var quitListener = {
  "observe": function (sender, evType, evData)
  {
    if (prefService.prefs.clearOnExit)
    {
      emptyDownloadsHistory();
    }
  }
};

// Listener for download manager events. Implements nsIDownloadProgressListener.
var downloadListener = {
  "onDownloadStateChange": function (previousState, download)
  {
    if (download.state === downloadManager.DOWNLOAD_FINISHED)
    {
      // As of Firefox ~21, not waiting for the download to finish causes lingering entries in the new download history.
      // Also, nsIGlobalHistory2 is no longer implemented.
      (startHistoryQuery.bind(download))(0);
    }
  },
  "onProgressChange": function (aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress, aDownload) { },
  "onSecurityChange": function (aWebProgress, aRequest, aState, aDownload) { },
  "onStateChange": function (aWebProgress, aRequest, aStateFlags, aStatus, aDownload) { }
};

// Query history for download's entry.
function startHistoryQuery(iterationCount)
{
  if (!executeTimeouts)
  {
    return;
  }
  
  asyncHistory.isURIVisited(this.source, deleteWhenVisited.bind(this, iterationCount));
}

// Callback for asynchronous history query. Removes download when found.
function deleteWhenVisited(iterationCount, uri, isVisited)
{
  if (isVisited)
  {
    // Delay operation for user-defined time to allow for notifications, opening and the like.
    timers.setTimeout(removeHistoryEntry.bind(this), prefService.prefs.clearDelay * 1000);
  }
  else if (iterationCount < 5)
  {
    // It isn't present yet. Delay 5 retries for 1s each.
    iterationCount++;
    timers.setTimeout(startHistoryQuery.bind(this, iterationCount), 1000);
  }
}

// Remove history entry "this".
function removeHistoryEntry()
{
  if (!executeTimeouts)
  {
    return;
  }
  
  try
  {
    browserHistory.removePage(this.source);
  }
  catch (removeEx)
  { }
}

// Does the actual deleting.
function emptyDownloadsHistory()
{
  var queryResult, uriList; 

  try
  {
    // Generate query for download transition.
    var options = historyService.getNewQueryOptions();
    var query = historyService.getNewQuery();

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
    var rootNode = queryResult.root;
    rootNode.containerOpen = true;
    
    for (var i = 0; i < rootNode.childCount; i++)
    {
      // Create real nsIURI from string and collect it.
      uriList.push(ioService.newURI(rootNode.getChild(i).uri, null, null));
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
      for (var i = 0; i < uriList.length; i++)
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
      downloadManager.addListener(downloadListener);
    }
    else
    {
      downloadManager.removeListener(downloadListener);
    }
  }
}

// Executed when this module is the main module in an extension that has just been loaded.
exports.main = function (options, callback)
{
  // Listen for "quitting" event.
  observerService.addObserver(quitListener, "quit-application-granted", false);
  
  // Enable timeout callbacks
  executeTimeouts = true;
  
  // Observe all setting changes.
  for (var name in prefNames)
  {
    if (prefNames.hasOwnProperty(name))
    {
      prefService.on(name, prefChanged);
      prefChanged(name);
    }
  }
  
  prefService.on("clearNow", emptyDownloadsHistory);
};

// Executed when this module is a loaded extension that is about to be unloaded.
exports.onUnload = function (reason)
{
  // Stop timeout callbacks from continuing.
  executeTimeouts = false;
  
  // Remove event listener.
  observerService.removeObserver(quitListener, "quit-application-granted");
  
  // Remove download listener
  downloadManager.removeListener(downloadListener);
  
  // Remove all setting listeners as well.  
  prefService.removeListener("clearNow", emptyDownloadsHistory);
  
  for (var name in prefNames)
  {
    if (prefNames.hasOwnProperty(name))
    {
      prefService.removeListener(name, prefChanged);
    }
  }
};
