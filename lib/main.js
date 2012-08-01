/*
Copyright 2012 Daniel Betz

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

var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

// Addon SDK imports
var timers = require("timers");
var prefService = require("simple-prefs");

// Downloads query: Download transition
var downloadsQuery = "place:transition=7";

// Contains timer ID, if active.
var clearInterval = null;

// Easy/strong access to settings.
var prefNames = {
  "asArray": [ "clearOnExit", "clearOnInterval", "clearInterval" ],
  "clearOnExit": "clearOnExit",
  "clearOnInterval": "clearOnInterval",
  "clearInterval": "clearInterval",
};

// Listener for "quitting" event - Places database is still available at this point.
var quitListener = {
  "observe": function (sender, evType, evData)
  {
    if (prefService.prefs.clearOnExit)
    {
      emptyDownloadsHistory();
    }
  }
};

// Does the actual deleting.
function emptyDownloadsHistory()
{
  var queriesRef = { };
  var queryCountRef = { };
  var optionsRef = { };

  // Deserialize query.
  historyService.queryStringToQueries(downloadsQuery, queriesRef, queryCountRef, optionsRef);
  
  // Execute query.
  var result = historyService.executeQueries(queriesRef.value, queryCountRef.value, optionsRef.value);

  var resultList = [];
  
  // Open and iterate results - they are "flat".
  var rootNode = result.root;
  rootNode.containerOpen = true;
  
  for (var i = 0; i < rootNode.childCount; i++)
  {
    // Create real nsIURI from string and collect it.
    resultList.push(ioService.newURI(rootNode.getChild(i).uri, null, null));
  }
  
  rootNode.containerOpen = false;
  
  if (resultList.length > 10)
  {
    // Bulk delete everything.
    browserHistory.removePages(resultList, resultList.length);
  }
  else
  {
    // Single delete to keep overhead low.
    for (var i = 0; i < resultList.length; i++)
    {
      browserHistory.removePage(resultList[i]);
    }
  }
}

// Executed when a user preference changes.
function prefChanged(prefName)
{
  if (prefName === prefNames.clearOnInterval)
  {
    // Handle interval enabled preference - start and stop timer as needed.
    if (prefService.prefs.clearOnInterval)
    {
      clearInterval = timers.setInterval(emptyDownloadsHistory, prefService.prefs.clearInterval * 60 * 1000);
    }
    else if (clearInterval != null)
    {
      timers.clearInterval(clearInterval);
      clearInterval = null;
    }
  }
  else if (prefName === prefNames.clearInterval)
  {
    // Handle interval time preference - if interval is enabled, reschedule.
    if (prefService.prefs.clearOnInterval)
    {
      if (clearInterval != null)
      {
        timers.clearInterval(clearInterval);
        clearInterval = null;
      }
      
      clearInterval = timers.setInterval(emptyDownloadsHistory, prefService.prefs.clearInterval * 60 * 1000);
    }
  }
}

// Executed when this module is the main module in an extension that has just been loaded.
exports.main = function (options, callback)
{
  // Listen for "quitting" event.
  observerService.addObserver(quitListener, "quit-application-granted", false);
  
  // Observe all setting changes.
  for (var i = 0; i < prefNames.asArray.length; i++)
  {
    prefService.on(prefNames.asArray[i], prefChanged);
    prefChanged(prefNames.asArray[i]);
  }
}

// Executed when this module is a loaded extension that is about to be unloaded.
exports.onUnload = function (reason)
{
  // Remove event listener.
  observerService.removeObserver(quitListener, "quit-application-granted");
  
  // Remove all setting listeners as well.
  for (var i = 0; i < prefNames.asArray.length; i++)
  {
    prefService.removeListener(prefNames.asArray[i], prefChanged);
  }
  
  // If the interval timer was active, disable it.
  if (clearInterval != null)
  {
    timers.clearInterval(clearInterval);
    clearInterval = null;
  }
}
