import styles from '../Publish.module.css';
import {io} from 'socket.io-client'
import { createEffect, createSignal, onMount } from 'solid-js';
import {Device} from "mediasoup-client";

function Publish() {

    const[socket,setSocket] = createSignal()
    const[connectedPeers,setConnectedPeers] = createSignal(0)
    const[publishing,setPublishing] = createSignal(false)

    let mediasoupDevice;
    let videoElem;
    let videoStream;
    let videoSender;
    let audioSender;
    let transport;

    onMount(()=>{
        setSocket(io('http://localhost:5000'))
    })


    const publishVideo=async()=>{
      try{
        videoStream = await navigator.mediaDevices.getUserMedia({video:true,audio:{
            noiseSuppression:true,
            echoCancellation:true
        }})
        videoElem.srcObject = videoStream;
        if(!publishing()){
          setPublishing(true)
          socket().emit('getRTPCapabilites')
        }
      }
      catch(err){
        console.log(err)
      }
    }

    const publishScreen=async()=>{
        try{
          videoStream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:{
              noiseSuppression:true,
              echoCancellation:true
          }})
          videoElem.srcObject = videoStream;
          videoStream?.getVideoTracks()[0]?.addEventListener("ended", () => Stop());
          if(!publishing()){
            setPublishing(true)
            socket().emit('getRTPCapabilites')
          }
        }
        catch(err){
          console.log(err)
        }
      }

createEffect(()=>{
  if(!socket()) return;

     socket().on('hereRTP',({capabilities})=>{
       handleCapabilities(capabilities)
     })

})

const handleCapabilities=async(capabilities)=>{
  let cap = {routerRtpCapabilities: capabilities};
  try{
      mediasoupDevice = new Device()
  }
  catch(err){
      console.error(err)
  }
 await mediasoupDevice.load(cap)
 if(mediasoupDevice?.loaded){
  console.log('loaded')
 }

 socket().emit('createTransport',{
  id:socket().id,
  rtpCapabilities: mediasoupDevice?.rtpCapabilities
})

}

  createEffect(()=>{
    if(!socket()) return;
    socket().on('transportCreated',({data})=>{
      handleTransport(data)
      })
  })


  async function handleTransport(message){
      if(message==='err'){
          console.log('error')
          return;
      }
      
      transport = mediasoupDevice.createSendTransport(message);
  
      transport.on('connect',({dtlsParameters},callback,errback)=>{
          socket().emit('connectTransport',{dtlsParameters,id:socket().id})
          socket().on('transportConnected',()=>{
              callback()
          })
      })
  
      transport.on("produce",({kind,rtpParameters},callback,errback)=>{
          socket().emit('produce',{kind,rtpParameters,id:socket().id})
          socket().on('producing',({producerId,type})=>{
          callback(producerId)
          })
      })
  
      transport.on("connectionstatechange",(state)=>{
          switch (state) {
              case 'connecting':
                  console.log('connecting')
                  break;
                  case 'connected':
                      console.log("connected")
                  break;
                  case 'failed':
                   console.log("failed")
                   transport.close()
                  break;
              default:
                  break;
          }
      })
  
  try{
      const Videotracks = videoStream.getVideoTracks()[0]
      const Audiotracks = videoStream.getAudioTracks()[0]
      videoSender =  await transport.produce({
        track:Videotracks,       
        encodings:[
        {
          rid: "r0",
          scaleResolutionDownBy : 4,
          maxBitrate            : 500000,
          scalabilityMode       : 'L1T3'
        }
        ,
        {
          rid: "r1",
          scaleResolutionDownBy : 2,
          maxBitrate            : 100000,
          scalabilityMode       : 'L1T3'
        }
        ,{
          rid: "r2",
          scaleResolutionDownBy : 1,
          maxBitrate            : 1500000,
          scalabilityMode       : 'L1T3'
        }
      ],})
      if(!Audiotracks) return;
      audioSender = await transport.produce({track:Audiotracks})
    }
    catch(err){
        console.log(err)
    }
  
  }

   function Stop(){
    socket().emit('closeProducer')
   }

   createEffect(()=>{
    if(!socket()) return;
    socket().on('closeProducer',async()=>{
      await transport.close()
      videoStream?.getTracks()?.forEach((track)=>{
        track.stop()
      })
      videoStream = null;
      videoElem?.srcObject?.getTracks().forEach((track)=>{
        track.stop()
      })
      videoElem.srcObject = null;
      videoSender = null;
      audioSender = null;
      setPublishing(false)
      setConnectedPeers(0)
    })
   })

   createEffect(()=>{
    if(!socket()) return;
    socket().on('newConsumer',()=>{
      setConnectedPeers((prev)=>prev+1)
    })
   })

   createEffect(()=>{
    if(!socket()) return;
    socket().on('consumerLeft',()=>{
      setConnectedPeers((prev)=>prev+-1)
    })
   })


  return (
    <div class={styles.App}>
       <div class={styles.videoCont}>
             <video ref={videoElem} muted autoplay></video>
             <h1 class={styles.notPub}>NOT PUBLISHED YET!</h1>
             {connectedPeers()>0&&<span class={styles.conPeers}><i class="fa-solid fa-person"></i> {connectedPeers()}</span>}
       </div>

       <div class={styles.buttons}>
        <button disabled={publishing()} onClick={publishVideo} class={styles.pubVideo}>Publish Video</button>
        <button disabled={publishing()} onClick={publishScreen} class={styles.pubScreen}>Publish Screen</button>
        {publishing()&&<button onClick={Stop} class={styles.stop}>Stop</button>}
       </div>

    </div>
  );
}

export default Publish;