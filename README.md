# .ini Editor Obsidian Plugin
A plugin for [Obsidian](https://obsidian.md) which allows editing of .ini files.

### Compatibility

The current API of this repo targets Obsidian **v0.10.11**.  
It won't work in versions below that due to the apis used only being exposed in 0.10.11

### Notes
This is all very much just a proof of concept for now. Expect bugs and data loss. This is just to prove to myself I *can* handle custom files, before moving on to more interesting files (e.g. CSV) in future.

## Installation

### From GitHub
- Download the latest master
- Extract the files from the zip to your vault's plugins folder: `<vault>/.obsidian/plugins/ini-obsidian`  
Note: On some machines the `.obsidian` folder may be hidden. On MacOS you should be able to press `Command+Shift+Dot` to show the folder in Finder.
- Reload Obsidian
- If prompted about Safe Mode, you can disable safe mode and enable the plugin.
Otherwise head to Settings, third-party plugins, make sure safe mode is off and
enable the plugin from there.

## Development

This project uses Typescript to provide type checking and documentation.  
The repo depends on the latest [plugin API](https://github.com/obsidianmd/obsidian-api) in Typescript Definition format, which contains TSDoc comments describing what it does.

**Note:** The Obsidian API is still in early alpha and is subject to change at any time!

If you want to contribute to development and/or just customize it with your own
tweaks, you can do the following:
- Clone this repo.
- `npm i` or `yarn` to install dependencies
- `npm run build` to compile.
- Copy `manifest.json`, `main.js` and `styles.css` to a subfolder of your plugins
folder (e.g, `<vault>/.obsidian/plugins/cm-show-whitespace-obsidian/`)
- Reload obsidian to see changes

Alternately, you can clone the repo directly into your plugins folder and once
dependencies are installed use `npm run dev` to start compilation in watch mode.  
You may have to reload obsidian (`ctrl+R`) to see changes.

## Pricing
Huh? This is an open-source plugin I made *for fun*. It's completely free.
However, if you absolutely *have* to send me money because you like it that
much, feel free to throw some coins in my hat via
[PayPal](https://paypal.me/deathau) or sponsor me via
[GitHub Sponsors](https://github.com/sponsors/deathau)

# Version History
## 0.0.1
Initial release!
- You can open and edit ini files
- buggy (for some reason the text doesn't appear until you click on it the first time)
