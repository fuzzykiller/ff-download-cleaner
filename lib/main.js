var {Cc, Ci} = require("chrome");
var timers = require("timers");
var prefService = require("simple-prefs");

var browserHistory = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsIBrowserHistory);
var annotationService = Cc["@mozilla.org/browser/annotation-service;1"].getService(Ci.nsIAnnotationService);
var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

// Contains timer ID, if active.
var clearInterval = null;

// Easy/strong access to settings.
var prefNames = {
  "asArray": [ "clearOnExit", "clearOnInterval", "clearInterval", "leaveInHistory" ],
  "clearOnExit": "clearOnExit",
  "clearOnInterval": "clearOnInterval",
  "clearInterval": "clearInterval",
  "leaveInHistory": "leaveInHistory"
};

// Listener for "quitting" event - Places database is still available at this point.
var quitListener = {
  "observe": function (sender, evType, evData)
  {
    if (prefService.prefs.clearOnExit)
    {
      clearDownloads();
    }
  }
};

// Does the actual removing of pages or annotations, depending on user settings.
function clearListInternal(resultList, annotation)
{
  if (prefService.prefs.leaveInHistory)
  {
    for (var i = 0; i < resultList.length; i++)
    {
      annotationService.removePageAnnotation(resultList[i], annotation);
    }
  }
  else
  {
    if (resultList.length < 10)
    {
      for (var i = 0; i < resultList.length; i++)
      {
        browserHistory.removePage(resultList[i]);
      }
    }
    else
    {
      browserHistory.removePages(resultList);
    }
  }
}

function clearDownloads()
{
  console.log("Hier könnte Ihr Code stehen!");
  return;
  
  // Annotations to consider.
  var annotations = [ "downloads/destinationFileURI", "downloads/destinationFileName" ];
  
  for (var i = 0; i < annotations.length; i++)
  {
    var resultList = annotationService.getPagesWithAnnotation(annotations[i]);
    clearListInternal(resultList, annotations[i]);
  }
}

function prefChanged(prefName)
{
  if (prefName === prefNames.clearOnInterval)
  {
    if (prefService.prefs.clearOnInterval)
    {
      clearInterval = timers.setInterval(clearDownloads, prefService.prefs.clearInterval * 60 * 1000);
    }
    else if (clearInterval != null)
    {
      timers.clearInterval(clearInterval);
      clearInterval = null;
    }
  }
  else if (prefName === prefNames.clearInterval)
  {
    if (prefService.prefs.clearOnInterval)
    {
      if (clearInterval != null)
      {
        timers.clearInterval(clearInterval);
        clearInterval = null;
      }
      
      clearInterval = timers.setInterval(clearDownloads, prefService.prefs.clearInterval * 60 * 1000);
    }
  }
}

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
                                  
function logDownloads()
{
  var resultList = annotationService.getPagesWithAnnotation("downloads/destinationFileURI");
  console.log(JSON.stringify(resultList));
}
