import "./styles.css";
import Navbar from "./components/Navbar.js";
import { Route, Routes } from "react-router-dom";
import App from './App.js'

export default function Appssss() {

    return (
      <div>
      <div>
        <Routes>
          <Route path="/" element={<App />} />
        </Routes>
        <Navbar />
        <Footer/>
      </div>
      </div>
    );
  }