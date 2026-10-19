import React from 'react';
import {createRoot} from 'react-dom/client';
import Tracker from './app/tracker';
import Admin from './admin';
import './app/globals.css';
const standalone=import.meta.env.VITE_STANDALONE==='true';
createRoot(document.getElementById('root')!).render(standalone?(location.pathname==='/admin'?<Admin/>:<Tracker apiUrl="/api/tracker" mentorUrl="/admin" trackingUrl={location.origin+'/'}/>):<Tracker apiUrl="https://weeklytracker.rileighr7073.workers.dev/api/tracker" mentorUrl="https://weeklytracker.rileighr7073.workers.dev/admin"/>);
