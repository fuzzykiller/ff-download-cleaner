# ff-download-cleaner
This Firefox extension removes entries from the new Downloads history, either after finishing a download or when Firefox is closing. By default, downloads will be removed five seconds after finishing.

This extension supports e10s.

## Building
Use the [Firefox Add-on SDK](https://developer.mozilla.org/Add-ons/SDK) to create an installable `.xpi` file from this source code.

1. Install [NodeJS](https://nodejs.org)
2. Install `jpm`, which is replacing the old `cfx` tool:
   ```
   npm install -g jpm
   ```

3. In the repo’s root directory, build the extension:
   ```
   jpm xpi
   ```

## Notes
Automatic removal only affects files downloaded while the add-on is active. To remove all history entries, use the on-demand button in the add-on’s settings.

All builds currently hosted on Mozilla Add-ons were created using the legacy `cfx` tool.

## Future
Development on a new version using [Web Extensions](https://developer.mozilla.org/en-US/Add-ons/WebExtensions) has started. The project is located [here](https://github.com/fuzzykiller/download-cleaner-lite).

## Further reading
* [`nsINavHistoryService`](https://developer.mozilla.org/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsINavHistoryService)
* [`nsIBrowserHistory`](https://developer.mozilla.org/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIBrowserHistory)
