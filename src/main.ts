import { Plugin, WorkspaceLeaf, addIcon, TextFileView, Setting, MarkdownRenderer, MarkdownSourceView, MarkdownView, setIcon, ToggleComponent } from 'obsidian';
import * as Papa from 'papaparse';
import Handsontable from "handsontable";
import 'handsontable/dist/handsontable.full.min.css';
import './styles.scss'

export default class CsvPlugin extends Plugin {

  async onload() {

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

class ExtHandsontable extends Handsontable {
  extContext: any;

  constructor(element: Element, options: Handsontable.GridSettings, context:any) {
    super(element, options);
    this.extContext = context;
  }
}

// This is the custom view
class CsvView extends TextFileView {

  parseResult: any;
  headerToggle: ToggleComponent;
  headers: string[] = null;
  fileOptionsEl: HTMLElement;
  hot: Handsontable;
  hotSettings: Handsontable.GridSettings;
  hotExport: Handsontable.plugins.ExportFile;
  hotState: Handsontable.plugins.PersistentState;
  hotFilters: Handsontable.plugins.Filters;
  loadingBar: HTMLElement;

  // this.contentEl is not exposed, so cheat a bit.
  public get extContentEl(): HTMLElement {
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
    this.loadingBar = document.createElement('div');
    this.loadingBar.addClass("progress-bar");
    this.loadingBar.innerHTML = `<div class="progress-bar-message u-center-text">Loading CSV...</div><div class="progress-bar-indicator"><div class="progress-bar-line"></div><div class="progress-bar-subline" style="display: none;"></div><div class="progress-bar-subline mod-increase"></div><div class="progress-bar-subline mod-decrease"></div></div>`
    this.extContentEl.appendChild(this.loadingBar);

    this.fileOptionsEl = document.createElement('div');
    this.fileOptionsEl.classList.add('csv-controls');
    this.extContentEl.appendChild(this.fileOptionsEl);

    new Setting(this.fileOptionsEl)
      .setName('File Includes Headers')
      .addToggle(toggle => {
        this.headerToggle = toggle;
        toggle.setValue(false).onChange(this.toggleHeaders)
      })
    const tableContainer = document.createElement('div');
    tableContainer.classList.add('csv-table-wrapper');
    this.extContentEl.appendChild(tableContainer);

    const hotContainer = document.createElement('div');
    tableContainer.appendChild(hotContainer);


    Handsontable.renderers.registerRenderer('markdown', this.markdownCellRenderer)
    Handsontable.editors.registerEditor('markdown', MarkdownCellEditor)
    this.hotSettings = {
      afterChange: this.hotChange,
      afterColumnSort: this.requestSave,
      afterColumnMove: this.requestSave,
      afterRowMove:   this.requestSave,
      afterCreateCol: this.requestSave,
      afterCreateRow: this.requestSave,
      afterRemoveCol: this.requestSave,
      afterRemoveRow: this.requestSave,
      licenseKey: 'non-commercial-and-evaluation',
      colHeaders: true,
      rowHeaders: true,
      autoColumnSize: true,
      autoRowSize: true,
      renderer: 'markdown',
      editor: 'markdown',
      className: 'csv-table',
      contextMenu: true,
      currentRowClassName: 'active-row',
      currentColClassName: 'active-col',
      columnSorting: true,
      dropdownMenu: true,
      filters: true,
      manualColumnFreeze: true,
      manualColumnMove: false,  // moving columns causes too many headaches for now
      manualColumnResize: true,
      manualRowMove: false,  // moving rows causes too many headaches for now
      manualRowResize: true,
      persistentState: true,
      // preventOverflow: true,
      search: true, // TODO:290 Hijack the search ui from markdown views,
      height: '100%',
      width: '100%',
      // stretchH: 'last'
    }
    this.hot = new ExtHandsontable(hotContainer, this.hotSettings, {leaf:this.leaf});
    this.hotExport = this.hot.getPlugin('exportFile');
    this.hotState = this.hot.getPlugin('persistentState');
    this.hotFilters = this.hot.getPlugin('filters');

  }

  hotChange = (changes: Handsontable.CellChange[], source: Handsontable.ChangeSource) => {
    if (source === 'loadData') {
      return; //don't save this change
    }
    this.requestSave();
  }

  toggleHeaders = (value: boolean) => {
    value = value || false; // just in case it's undefined
    // turning headers on
    if (value) {
      // we haven't specified headers yet
      if (this.hotSettings.colHeaders === true) {
        // get the data
        let data = this.hot.getSourceDataArray();
        // take the first row off the data to use as headers
        this.hotSettings.colHeaders = data.shift();
        // reload the data without this first row
        this.hot.loadData(data);
        // update the settings
        this.hot.updateSettings(this.hotSettings);
      }
    }
    // turning headers off
    else {
      // we have headers
      if (this.hotSettings.colHeaders !== true) {
        // get the data
        let data = this.hot.getSourceDataArray();
        // put the headings back in as a row
        data.unshift(this.hot.getColHeader());
        // specify true to just display alphabetical headers
        this.hotSettings.colHeaders = true;
        // reload the data with this new first row
        this.hot.loadData(data);
        // update the settings
        this.hot.updateSettings(this.hotSettings);
      }
    }

    // set this value to the state
    this.hotState.saveValue('hasHeadings', value);
  }

  // get the new file contents
  getViewData = () => {
    // get the *source* data (i.e. unfiltered)
    let data = this.hot.getSourceDataArray();
    if (this.hotSettings.colHeaders !== true) {
      data.unshift(this.hot.getColHeader());
    }

    let csvString = Papa.unparse(data);

    return csvString;
    // return Papa.unparse({fields: this.parseResult.fields, data: this.parseResult.data}, {header: false});
    // return Papa.unparse(this.parseResult);
  }

  // set the file contents
  setViewData = (data: string, clear: boolean) => {
    this.loadingBar.show();
    setTimeout(() => this.loadDataAsync(data).then(() => this.loadingBar.hide()), 50);
  }

  loadDataAsync = async (data: string) => {
    return new Promise<void>((resolve, reject) => {
      // for the sake of persistent settings we need to set the root element id
      this.hot.rootElement.id = this.file.path;
      this.hotSettings.colHeaders = true;

      // strip Byte Order Mark if necessary (damn you, Excel)
      if (data.charCodeAt(0) === 0xFEFF) data = data.slice(1);

      // parse the incoming data string
      // My IDE won't recognise the parse string...
      // @ts-ignore
      Papa.parse(data, {
        download: undefined,
        header: false,
        complete: results => {
          this.parseResult = results;
          // load the data into the table
          this.hot.loadData(this.parseResult.data);
          // we also need to update the settings so that the persistence will work
          this.hot.updateSettings(this.hotSettings);

          // load the persistent setting for headings
          let hasHeadings = { value: false };
          this.hotState.loadValue('hasHeadings', hasHeadings);
          this.headerToggle.setValue(hasHeadings.value);

          // toggle the headers on or off based on the loaded value
          this.toggleHeaders(hasHeadings.value)
          resolve();
        },
        error: (error: Papa.ParseError) => {
          reject(error);
        }
      });
    });
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

class MarkdownCellEditor extends Handsontable.editors.BaseEditor {
  eGui: HTMLElement;
  view: MarkdownView;

  init(): void {
    const extContext: any = (this.hot as ExtHandsontable).extContext;
    if (extContext && extContext.leaf && !this.eGui) {
      // create the container
      this.eGui = this.hot.rootDocument.createElement('DIV');
      Handsontable.dom.addClass(this.eGui, 'htMarkdownEditor');
      Handsontable.dom.addClass(this.eGui, 'csv-cell-edit');

      // create a markdown (editor) view
      this.view = new MarkdownView(extContext.leaf);

      // @ts-ignore add the editor element to the container
      this.eGui.appendChild(this.view.sourceMode.editorEl);
      // hide the container
      this.eGui.style.display = 'none';
      // add the container to the table root element
      this.hot.rootElement.appendChild(this.eGui);
    }
  }

  open(event?: Event): void {
    this.refreshDimensions();
    this.eGui.show();
    this.view.editor.focus();
    this.view.editor.refresh();
  }

  refreshDimensions() {
    this.TD = this.getEditedCell();

    // TD is outside of the viewport.
    if (!this.TD) {
      this.close();

      return;
    }
    //@ts-ignore
    const { wtOverlays } = this.hot.view.wt;
    const currentOffset = Handsontable.dom.offset(this.TD);
    const containerOffset = Handsontable.dom.offset(this.hot.rootElement);
    const scrollableContainer = wtOverlays.scrollableElement;
    const editorSection = this.checkEditorSection();
    let width = Handsontable.dom.outerWidth(this.TD) + 1;
    let height = Handsontable.dom.outerHeight(this.TD) + 1;
    //@ts-ignore
    let editTop = currentOffset.top - containerOffset.top - 1 - (scrollableContainer.scrollTop || 0);
    //@ts-ignore
    let editLeft = currentOffset.left - containerOffset.left - 1 - (scrollableContainer.scrollLeft || 0);
    let cssTransformOffset;

    switch (editorSection) {
      case 'top':
        cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.topOverlay.clone.wtTable.holder.parentNode);
        break;
      case 'left':
        cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.leftOverlay.clone.wtTable.holder.parentNode);
        break;
      case 'top-left-corner':
        cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.topLeftCornerOverlay.clone.wtTable.holder.parentNode);
        break;
      case 'bottom-left-corner':
        cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.bottomLeftCornerOverlay.clone.wtTable.holder.parentNode);
        break;
      case 'bottom':
        cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.bottomOverlay.clone.wtTable.holder.parentNode);
        break;
      default:
        break;
    }

    if (this.hot.getSelectedLast()[0] === 0) {
      editTop += 1;
    }
    if (this.hot.getSelectedLast()[1] === 0) {
      editLeft += 1;
    }

    const selectStyle = this.eGui.style;

    if (cssTransformOffset && cssTransformOffset !== -1) {
      //@ts-ignore
      selectStyle[cssTransformOffset[0]] = cssTransformOffset[1];
    } else {
      Handsontable.dom.resetCssTransform(this.eGui);
    }

    const cellComputedStyle = Handsontable.dom.getComputedStyle(this.TD, this.hot.rootWindow);
    //@ts-ignore
    if (parseInt(cellComputedStyle.borderTopWidth, 10) > 0) {
      height -= 1;
    }
    //@ts-ignore
    if (parseInt(cellComputedStyle.borderLeftWidth, 10) > 0) {
      width -= 1;
    }

    selectStyle.height = `${height}px`;
    selectStyle.minWidth = `${width}px`;
    selectStyle.maxWidth = `${width}px`;
    selectStyle.top = `${editTop}px`;
    selectStyle.left = `${editLeft}px`;
    selectStyle.margin = '0px';
  }

  getEditedCell() {
    //@ts-ignore
    const { wtOverlays } = this.hot.view.wt;
    const editorSection = this.checkEditorSection();
    let editedCell;

    switch (editorSection) {
      case 'top':
        editedCell = wtOverlays.topOverlay.clone.wtTable.getCell({
          row: this.row,
          col: this.col
        });
        this.eGui.style.zIndex = '101';
        break;
      case 'top-left-corner':
      case 'bottom-left-corner':
        editedCell = wtOverlays.topLeftCornerOverlay.clone.wtTable.getCell({
          row: this.row,
          col: this.col
        });
        this.eGui.style.zIndex = '103';
        break;
      case 'left':
        editedCell = wtOverlays.leftOverlay.clone.wtTable.getCell({
          row: this.row,
          col: this.col
        });
        this.eGui.style.zIndex = '102';
        break;
      default:
        editedCell = this.hot.getCell(this.row, this.col);
        this.eGui.style.zIndex = '';
        break;
    }

    return editedCell < 0 ? void 0 : editedCell;
  }

  close(): void {
    this.eGui.hide();
  }
  focus(): void {
    this.view.editor.focus();
    this.view.editor.refresh();
  }
  getValue() {
    return this.view.currentMode.get();
  }
  setValue(newValue?: any): void {
    this.view.currentMode.set(newValue, true);
  }
}
