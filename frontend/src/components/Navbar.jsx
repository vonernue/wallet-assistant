import "./Navbar.css";
import { MenuItems } from "./MenuItems";
import { Link } from "react-router-dom";
import { Button } from "@mui/material";

//import { DensitySmallIcon } from '@mui/icons-material/DensitySmallIcon';
//import { ClearIcon } from '@mui/icons-material/Clear';

export default function Navbar() {
  return (
    <nav className="navbarItems">
      <h1 className="navbar-left">
        MCP BLOCKCHAIN
      </h1>

      <ul className="navbar-menu active">
        {MenuItems.map((item, index) => {
          return (
            <li key={index}>
              <Link className={item.name} to={item.url}>
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="account">
        <a href="/metaMask"><Button>MetaMask TransX</Button></a>
        <a href="/chatbot"><Button>Chatbot</Button></a>
      </div>
    </nav>
  );
}