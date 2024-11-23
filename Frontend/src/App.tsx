import { useEffect, useRef, useState } from 'react'
import './App.css'
import { EditorView } from 'codemirror'
import { PluginValue, ViewPlugin, ViewUpdate, lineNumbers } from '@codemirror/view';
import { oneDarkTheme } from '@codemirror/theme-one-dark';
import { ChangeSet, Compartment, EditorState, Extension } from '@codemirror/state';
import { collab,sendableUpdates,getSyncedVersion,receiveUpdates } from '@codemirror/collab';

//function Extension
function extension(version : number,connection : WebSocket){
  let plugin = ViewPlugin.define((editor : EditorView)=>{
    let blocking = false;
    connection.addEventListener('message',OnMsg)

    function OnMsg(e : MessageEvent<any>){
      const data = e.data;
      const parsed : SMSG = JSON.parse(data);

      const msg = parsed.msg;
      if(msg == 'Pull'){
        const newupds = parsed.updates.map(itm=>({
          changes : ChangeSet.fromJSON(itm.changes),
          clientID : itm.clientID
        }))
        editor.dispatch(receiveUpdates(editor.state,newupds))
        blocking = false;
        push()
      }
      if(msg == 'Action'){
        if(parsed.action == 'Pull') pull();
        if(parsed.action == 'Push') push();
      }
      
    }

    function pull(){
      const version = getSyncedVersion(editor.state);
      connection.send(JSON.stringify({msg : 'Pull',version}))
    }

    function push(){
      //get updates
      let updates = sendableUpdates(editor.state).map(u => ({
        clientID : u.clientID,
        changes : u.changes.toJSON()
      }));

      if(blocking || !updates.length) return;
      
      
      //send our changes
      blocking = true;
      const newvers = getSyncedVersion(editor.state);
      const senddata : CMSG = {
        msg : 'Push',
        version : newvers,
        updates : updates
      }

      connection.send(JSON.stringify(senddata))
    }

    function update(upd : ViewUpdate){
      if(upd.docChanged){
        push()

      }
    }

    function destroy(){
      connection.removeEventListener('message',OnMsg)
    }
    
    return {
      update,
      destroy
    }
  })

  return [collab({startVersion : version}),plugin];
  
}


//server message
type SMSG = {
  msg : 'GetDocument',
  version : number,
  doc : string,
} | {
  msg : 'Action',
  action : 'Pull' | 'Push'
} | {
  msg : 'Pull',
  updates : Array<{clientID : string,changes : any}>
}

//client message
type CMSG = {
  msg : 'Push',
  version : number,
  updates : Array<{clientID : string,changes : any}>
}

//editor
function MultiEdit(view? : EditorView){
  const [comp,] = useState(new Compartment());

  const [text,settext] = useState<string>();

  function Reconfigure(data : SMSG,socket : WebSocket){
    
    if(!view) return;
    if(data.msg == 'GetDocument'){
      const ext = extension(data.version,socket);
      //Create new editor state 
      //or save state current doc

      const newstate = EditorState.create({
        doc : data.doc,
        extensions : [
          lineNumbers(),
          oneDarkTheme,
          EditorView.lineWrapping,
          ext,
        ],
      })

      view.setState(newstate);

      // view.dispatch({
      //   effects : comp.reconfigure(ext),
      //   changes : {
      //     from : 0,
      //     to: view.state.doc.length,
      //     insert : data.doc,

      //   }
      // })
      
    }
  }

  //connect using websocket
  useEffect(()=>{
    if(!view) return
    const addr = `ws://${window.location.hostname}:${window.location.port}`;
    //const addr = `ws://${window.location.hostname}:${9092}`;
    const ws = new WebSocket(addr);
    //listen once for get message before deleting
    ws.onopen = (e)=>{
      ws.send(JSON.stringify({
        msg : "GetDocument"
      }));
    }
    
    ws.onmessage = (e)=>{
      ws.onopen = null;
      ws.onmessage = null;
      view && Reconfigure(JSON.parse(e.data),ws);
    }


    return ()=>{
      if(ws.readyState == ws.OPEN) ws.close()
    }
  },[view])


  return comp.of([]);
}

function App() {
  const parent = useRef<HTMLDivElement>(null);
  const [Edit,SetEdit] = useState<EditorView>();  

  const useMultiEdit = MultiEdit(Edit);


  //create the editor
  useEffect(()=>{
    if(!parent.current) return;

    const editor = new EditorView({
      extensions : [
        lineNumbers(),
        oneDarkTheme,
        EditorView.lineWrapping,
        useMultiEdit,
      ],
      parent : parent.current
    })
    SetEdit(editor);

    return ()=>{
      editor.destroy();
    }
  },[parent])

  return (
    <div className='App'>
      <label>{}</label>
      <div className='Editor' ref={parent}>

      </div>
    </div>
  )
}

export default App
