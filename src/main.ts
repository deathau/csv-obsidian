import { Plugin, WorkspaceLeaf, addIcon, TextFileView, Setting, MarkdownRenderer, MarkdownSourceView, MarkdownView, setIcon } from 'obsidian';
import * as Papa from 'papaparse';
import Handsontable from "handsontable";
import 'handsontable/dist/handsontable.full.min.css';
import './styles.scss'

export default class CsvPlugin extends Plugin {

  settings: any;

  async onload() {
    this.settings = await this.loadData() || {} as any;

    // register a custom icon
    this.addDocumentIcon("csv");

    // register the view and extensions
    this.registerView("csv", this.csvViewCreator);
    this.registerExtensions(["csv"], "csv");
  }

  // function to create the view
  csvViewCreator = (leaf: WorkspaceLeaf) => {
    return new CsvView(leaf);
  }

  // this function used the regular 'document' svg,
  // but adds the supplied extension into the icon as well
  addDocumentIcon = (extension: string) => {
    addIcon(`document-${extension}`, `
  <path fill="currentColor" stroke="currentColor" d="M14,4v92h72V29.2l-0.6-0.6l-24-24L60.8,4L14,4z M18,8h40v24h24v60H18L18,8z M62,10.9L79.1,28H62V10.9z"></path>
  <text font-family="sans-serif" font-weight="bold" font-size="30" fill="currentColor" x="50%" y="60%" dominant-baseline="middle" text-anchor="middle">
    ${extension}
  </text>
    `);
  }
}

// This is the custom view
class CsvView extends TextFileView {

  parseResult: any;
  headers: boolean = false;
  fileOptionsEl: HTMLElement;
  hot: Handsontable;
  hotSettings: Handsontable.GridSettings;

  // this.contentEl is not exposed, so cheat a bit.
  public get extContentEl(): HTMLElement {
    // @ts-ignore
    return this.contentEl;
  }

  // constructor
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.onResize = () => {
      //@ts-ignore
      this.hot.view.wt.wtOverlays.updateMainScrollableElements();
      this.hot.render();
    }
    this.fileOptionsEl = document.createElement('div');
    this.fileOptionsEl.classList.add('csv-controls');
    this.extContentEl.appendChild(this.fileOptionsEl);

    new Setting(this.fileOptionsEl)
      .setName('File Includes Headers')
      .addToggle(toggle => {
        toggle.setValue(false).onChange(this.toggleHeaders)
      })
    const tableContainer = document.createElement('div');
    tableContainer.classList.add('csv-table-wrapper');
    this.extContentEl.appendChild(tableContainer);

    const hotContainer = document.createElement('div');
    tableContainer.appendChild(hotContainer);


    Handsontable.renderers.registerRenderer('markdown', this.markdownCellRenderer)
    // Handsontable.renderers.registerRenderer('markdown', this.markdownCellRenderer)
    this.hotSettings = {
      // afterChange: this.hotChange,
      licenseKey: 'non-commercial-and-evaluation',
      colHeaders: false,
      rowHeaders: true,
      autoColumnSize: true,
      autoRowSize: true,
      renderer: 'markdown',
      // editor: 'markdown',
      className: 'csv-table',
      contextMenu: true,
      currentRowClassName: 'active-row',
      currentColClassName: 'active-col',
      columnSorting: true,
      dropdownMenu: true,
      filters: true,
      manualColumnFreeze: true,
      manualColumnMove: true,
      manualColumnResize: true,
      manualRowMove: true,
      manualRowResize: true,
      // preventOverflow: true,
      search: true, // TODO:290 Hijack the search ui from markdown views,
      height: '100%',
      width: '100%',
      // stretchH: 'last'
    }
    this.hot = new Handsontable(hotContainer, this.hotSettings);
  }

  hotChange = (change: Handsontable.CellChange[], source: Handsontable.ChangeSource) => {
    console.log('cellValueChanged', change);
  }

  toggleHeaders = (value:boolean) => {
    this.headers = value;
    this.refreshData();
  }

  // get the new file contents
  getViewData = () => {
    return Papa.unparse({ fields: this.parseResult.fields, data: this.parseResult.data }, {header: this.headers});
  }

  refreshData = () => {
    let data = [...this.parseResult.data];
    if (this.headers) {
      this.hotSettings.colHeaders = data.shift();
    }
    else {
      this.hotSettings.colHeaders = true;
    }

    this.hot.updateSettings(this.hotSettings);
    this.hot.loadData(data);
    this.hot.render();
  }

  // set the file contents
  setViewData = (data: string, clear: boolean) => {
    if (clear) {
      this.hot.rootElement.id = this.file.path;
      this.hotSettings.persistentState = true;
    }
    else {
      
    }

    // parse the incoming data string
    this.parseResult = Papa.parse(data, {
      header: false //this.headers
    });

    this.refreshData();
  }

  markdownCellRenderer = (instance: Handsontable, TD: HTMLTableCellElement, row: number, col: number, prop: string | number, value: Handsontable.CellValue, cellProperties: Handsontable.CellProperties): HTMLTableCellElement | void => {
    TD.innerHTML = '';
    MarkdownRenderer.renderMarkdown(value, TD, this.file.path || '', this || null);
    return TD;
  }

  // clear the view content
  clear = () => {

  }

  // gets the title of the document
  getDisplayText() {
    if (this.file) return this.file.basename;
    else return "csv (no file)";
  }

  // confirms this view can accept csv extension
  canAcceptExtension(extension: string) {
    return extension == 'csv';
  }

  // the view type name
  getViewType() {
    return "csv";
  }

  // icon for the view
  getIcon() {
    return "document-csv";
  }
}