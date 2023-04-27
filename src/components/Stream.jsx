import styles from '../Stream.module.css';
import {io} from 'socket.io-client'
import { createEffect, createSignal, onMount } from 'solid-js';
import toast, { Toaster } from 'solid-toast';
import { Device } from 'mediasoup-client';

function Stream() {

    const[socket,setSocket] = createSignal()
    const[subscribed,setSubscribed]= createSignal(false)

    let audioElem;
    let videoElem;
    let mediasoupDevice;
    let receiveTransport;
    

    onMount(()=>{
        setSocket(io('http://localhost:5000'))
    })

    createEffect(()=>{
        if(!socket()) return;
        socket()?.on('newPub',()=>{
        toast.success("New Publisher has Arrived. Click on Subscribe to Consume their Stream")
        })
    })

    const Subscribe=async()=>{
        if(subscribed()){
         socket().emit('closeStream')
        }
        else{
          socket().emit('getPub')
          
        }
    }

    createEffect(()=>{
      if(!socket()) return;
      socket().on('getPub',(publisher)=>{
       if(publisher){
        socket().emit('getRTPCapabilites')
       }
       else{
        alert('No Publisher Found!')
       }
      })
    })

    createEffect(()=>{
        if(!socket()) return;
        socket().on('hereRTP',({capabilities})=>{
         handleCapabilities(capabilities)
       })
    })

    const handleCapabilities=async(capabilities)=>{
      let cap = {routerRtpCapabilities: capabilities};
      try{
          mediasoupDevice= new Device()
      }
      catch(err){
          console.error(err)
      }
     await mediasoupDevice?.load(cap)
     if(mediasoupDevice?.loaded){
      console.log('loaded')
     }
     socket().emit('createConsumeTransport',{forceTcp: false,rtpCapabilities: mediasoupDevice.rtpCapabilities,id:socket().id})
  }


   createEffect(()=>{
    if(!socket()) return;
    socket().on('ConsumeTransportCreated',(data)=>{
     consume(data)
    })
   })



async function consume(data){
if(data.data==='err'){
    console.log("Error Ocurred")
    return;
}
receiveTransport = mediasoupDevice.createRecvTransport(data.data)

receiveTransport.on('connect',({dtlsParameters},callback,errback)=>{
    socket().emit('transportConnect',{dtlsParameters,id:socket().id})
    socket().on('consumerTransportConnected',()=>{
        callback()
    })
})

receiveTransport.on("connectionstatechange",(state)=>{
 switch (state) {
    case 'connecting':
         console.log("Connecting To Stream!")
        break;
    case 'connected':
        console.log("subscribed!")
        break;
        case 'failed':
            console.log("Failed!")
            receiveTransport.close()
           break;
    default:
        break;
 }
})

const {rtpCapabilities} =  mediasoupDevice;
socket().emit('startConsuming',{id:socket().id,rtpCapabilities})

}

createEffect(()=>{
  if(!socket()) return;
  socket().on('datarecv',(data)=>{
    consumerDone(data)
  })
})


async function consumerDone(data){
const {
  producerId,
  kind,
  id,
  rtpParameters,
} = data;

let codecOptions = {}

if(kind==="video"){
  const consumer = await receiveTransport.consume({id,producerId,kind,rtpParameters,codecOptions})
  const mediaStream = new MediaStream()
  mediaStream.addTrack(consumer.track)
  videoElem.srcObject = mediaStream;
  setSubscribed(true)

}
else if(kind==="audio"){
  const consumer = await receiveTransport.consume({id,producerId,kind,rtpParameters,codecOptions})
  const mediaStream = new MediaStream()
  mediaStream.addTrack(consumer.track)
  audioElem.srcObject = mediaStream;
}

}


createEffect(()=>{
    if(!socket()) return;
    socket()?.on('closeStream',async(data)=>{
        await receiveTransport?.close()
        videoElem?.srcObject?.getTracks()?.forEach((track)=>{
          track.stop()
        })
        videoElem.srcObject = null;
        setSubscribed(false)
        if(data) return;
        toast.error("Stream Ended")
    })
})




  return (
    <div class={styles.App}>
       <Toaster position='top-center'/>
       <div class={styles.videoCont}>
       <h1 class={styles.notSub}>NOT SUBSCRIBED YET!</h1>
       <video ref={videoElem} autoplay></video>
       <audio ref={audioElem} autoplay hidden></audio>
       </div>

       <div class={styles.buttons}>
        <button onClick={Subscribe} class={styles.subVideo}>{subscribed()?'Unsubscribe':'Subscribe'}</button>
       </div>

    </div>
  );
}

export default Stream;