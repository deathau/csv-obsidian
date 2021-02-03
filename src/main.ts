import './styles.scss'
import { Plugin, WorkspaceLeaf, addIcon, TextFileView, Setting, MarkdownRenderer, MarkdownSourceView, MarkdownView, setIcon } from 'obsidian';
import * as Papa from 'papaparse';
import { Grid, GridOptions, ICellEditorComp, ICellEditorParams, ICellRendererComp, ICellRendererParams, RowNode } from 'ag-grid-community';
import { runInThisContext } from 'vm';

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

class ParseResult<T> implements Papa.ParseResult<T>, Papa.UnparseObject {
  data: T[];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
  fields: any[];
}

// This is the custom view
class CsvView extends TextFileView {

  parseResult: any;
  headers: boolean = false;
  gridEl: Grid;
  gridOptions: GridOptions;
  fileOptionsEl: HTMLElement;

  // this.contentEl is not exposed, so cheat a bit.
  public get extContentEl(): HTMLElement {
    // @ts-ignore
    return this.contentEl;
  }

  // constructor
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.fileOptionsEl = document.createElement('div');
    this.fileOptionsEl.classList.add('csv-controls');
    this.extContentEl.appendChild(this.fileOptionsEl);

    new Setting(this.fileOptionsEl)
      .setName('File Includes Headers')
      .addToggle(toggle => {
        toggle.setValue(false).onChange(this.toggleHeaders)
      })

    this.extContentEl.classList.add('ag-theme-alpine');

    this.gridOptions = {
      enableCellTextSelection:true,
      ensureDomOrder: true,
      context: {
        component: this,
        leaf: leaf
      },
      components: {
        markdownCellRenderer: MarkdownCellRenderer,
        markdownCellEditor: MarkdownCellEditor
      },
      isFullWidthCell: (rowNode: RowNode) => rowNode?.data?.isFooter,
      fullWidthCellRenderer: this.footerCellRenderer,
      getRowNodeId: (data) => `${this.parseResult?.data?.indexOf(data)}`
    };
    this.gridEl = new Grid(this.extContentEl, this.gridOptions);
  }

  toggleHeaders = (value:boolean) => {
    const data = this.getViewData();
    this.headers = value;
    this.setViewData(data, false);
  }

  // get the new file contents
  getViewData = () => {
    console.log("getViewData", this.parseResult.data, this.headers);
    return Papa.unparse({ fields: this.parseResult.fields, data: this.parseResult.data }, {header: this.headers});
  }

  defaultColumns: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  columnName = (n:number) => {
    if (n == 0) return 'A';
    let str:string[] = [];
    let i:number = 0; // To store current index in str which is result
    
    while (n >= 0) {
      // Find remainder
      let rem = n % 26;
      
      str[i++] = this.defaultColumns[rem];
      n = Math.floor(n / 26) - 1;
    }
    
    str = str.reverse();
    return str.join('');
  }

  getDefaultHeaderRow = (parseResult:any = this.parseResult) => {
    const defaultHeaderRow: string[] = [];
    // loop through the first row to create a header row
    for (let i = 0; i < parseResult.data[0].length; i++) {
      defaultHeaderRow.push(this.columnName(i));
    }
    return defaultHeaderRow;
  }

  // set the file contents
  setViewData = (data: string, clear: boolean) => {
    if (clear) {
      this.gridOptions.context.filePath = this.file.path;
    }
    else {
      
    }

    // parse the incoming data string
    let parseResult: Papa.ParseResult<object> = Papa.parse(data, {
      header: this.headers
    });

    // The grid view I'm using requires headers
    // so if the file doesn't contain them we have to make some up.
    if (!this.headers) {
      // add the new header row to the data
      const defaultHeaderRow = this.getDefaultHeaderRow(parseResult)
      parseResult.data.unshift(defaultHeaderRow);
      // re-parse the data with the header, so we get all the header related meta
      parseResult = Papa.parse(Papa.unparse(parseResult.data), { header: true });
      parseResult.meta.fields = defaultHeaderRow;
    }
    this.parseResult = parseResult;
    console.log('setViewData', this.parseResult);

    // map the header column to an object the grid can use
    const columns = this.parseResult.meta.fields.map((column: string, index:number) => {
      return {
        // header: column,
        field: column,
        // editor: 'text',
        filter: true,
        sortable: true,
        resizable: true,
        // rowDrag: true,
        dndSource: index == 0,
        editable: true,
        onCellValueChanged: this.cellValueChanged,
        //cellEditor:
        cellRenderer: 'markdownCellRenderer',
        cellEditor: 'markdownCellEditor',
        cellClass: (params: any) => `col-${params.colDef.field?.trim()?.toLowerCase()?.split(' ')?.join('-')}`
      }
    })
    columns.push({
      header: 'Actions',
      cellRenderer: this.actionsCellRenderer,
      pinned: 'right',
      width: 75,
      cellClass: 'col-delete'
    });

    // set the columns and data on the grid
    this.gridOptions.api.setColumnDefs(columns);
    this.gridOptions.api.setRowData([...this.parseResult.data, { isFooter: true }]);
  }

  actionsCellRenderer = (params: ICellRendererParams) => {
    const button = document.createElement('button');
    button.classList.add("mod-warning");
    button.onclick = (e) => {
      console.log(params);
      this.gridOptions.api.applyTransaction({ remove: [params.node] });
      this.parseResult.data.remove(this.parseResult.data[params.node.id]);
      this.requestSave();
    }
    setIcon(button, 'trash');
    return button.outerHTML;
  }

  footerCellRenderer = (params: ICellRendererParams) => {
    params.eGridCell.classList.add('row-add');
    const button = document.createElement('button');
    button.classList.add("mod-cta");
    button.onclick = (e) => {
      let newObj: any = {};
      this.parseResult.fields.forEach((field: string) => {
        newObj[field] = '';
      });
      // this.gridOptions.api.addItems([newObj]);
      this.gridOptions.api.applyTransaction({
        add: [newObj],
        addIndex: this.parseResult.data.length
      });
      this.parseResult.data.push(newObj);
      this.requestSave();
      console.log('after', this.parseResult)
    }
    button.innerText = "Add Row"
    return button;
  }

  cellValueChanged = (change: any) => {
    console.log('cellValueChanged', change);
    //! row index is wrong when sorted!!
    this.parseResult.data[change.node.id][change.column.colId] = change.newValue;
    this.requestSave();
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

class MarkdownCellRenderer implements ICellRendererComp {

  eGui: HTMLElement;

  // Optional - Params for rendering. The same params that are passed to the cellRenderer function.
  init(params: ICellRendererParams) {
    this.eGui = document.createElement('div');
    this.eGui.classList.add('csv-cell');
    MarkdownRenderer.renderMarkdown(params.value, this.eGui, params.context.filePath || '', params.context.component || null)
  }

  // Mandatory - Return the DOM element of the component, this is what the grid puts into the cell
  getGui () {
    return this.eGui;
  }

  // Optional - Gets called once by grid after rendering is finished - if your renderer needs to do any cleanup,
  // do it here
  destroy() {
    
  };

  // Mandatory - Get the cell to refresh. Return true if the refresh succeeded, otherwise return false.
  // If you return false, the grid will remove the component from the DOM and create
  // a new component in its place with the new values.
  refresh(params: ICellRendererParams) {
    // set value into cell again
    this.eGui.innerHTML = "";
    MarkdownRenderer.renderMarkdown(params.value, this.eGui, params.context.filePath || '', params.context.component || null)
    // return true to tell the grid we refreshed successfully
    return true;
  };
}

class MarkdownCellEditor implements ICellEditorComp {

  eGui: HTMLElement;
  view: MarkdownView;

  // gets called once after the editor is created
  init(params: ICellEditorParams) {
    this.eGui = document.createElement('div');
    this.eGui.classList.add('csv-cell-edit');
    this.view = new MarkdownView(params.context.leaf);
    this.view.currentMode = this.view.sourceMode;
    this.view.sourceMode.set(params.value, true);
    //@ts-ignore
    this.eGui.appendChild(this.view.sourceMode.editorEl);
    this.view.sourceMode.cmEditor.refresh();
  };

  // Gets called once after GUI is attached to DOM.
  // Useful if you want to focus or highlight a component
  // (this is not possible when the element is not attached)
  afterGuiAttached() {
    this.view.sourceMode.cmEditor.focus();
    this.view.sourceMode.cmEditor.refresh();
  }

  // Return the DOM element of your editor, this is what the grid puts into the DOM
  getGui() {
    this.view.sourceMode.cmEditor.refresh();
    return this.eGui;
  }

  // Should return the final value to the grid, the result of the editing
  getValue() {
    return this.view.sourceMode.get();
  }

  // Gets called once by grid after editing is finished
  // if your editor needs to do any cleanup, do it here
  destroy() {

  }

  // Gets called once after initialised.
  // If you return true, the editor will appear in a popup
  isPopup() { return false; }
}