import { useState } from "react";
import Candidates from "./pages/Candidates";

import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Divider,
} from "@mui/material";

import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import WorkIcon from "@mui/icons-material/Work";

import Dashboard from "./pages/Dashboard";

const drawerWidth = 250;
const headerHeight = 70;

const menuItems = [
  { name: "Dashboard", icon: <DashboardOutlinedIcon /> },
  { name: "Candidates", icon: <PeopleOutlinedIcon /> },
];

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState("Dashboard");

  const sidebar = (
    <Box sx={{ height: "100%", bgcolor: "#ffffff" }}>
      <Box sx={{ px: 3, py: 2.5 }}>
        <Typography variant="h5" fontWeight={800} color="#2563eb">
          Recruitment<span style={{ color: "#111827" }}>App</span>
        </Typography>

        <Typography variant="caption" color="text.secondary">
          Recruitment Management
        </Typography>
      </Box>

      <Divider />

      <Box sx={{ p: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: "#94a3b8",
            fontWeight: 700,
            letterSpacing: 1,
            px: 1,
          }}
        >
          MENU
        </Typography>

        <List sx={{ mt: 1 }}>
          {menuItems.map((item) => {
            const selected = activeMenu === item.name;

            return (
              <ListItemButton
                key={item.name}
                selected={selected}
                onClick={() => {
                  setActiveMenu(item.name);
                  setMobileMenuOpen(false);
                }}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  "&.Mui-selected": {
                    bgcolor: "#eff6ff",
                    color: "#2563eb",
                  },
                  "&.Mui-selected:hover": {
                    bgcolor: "#dbeafe",
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 40,
                    color: selected ? "#2563eb" : "#64748b",
                  }}
                >
                  {item.icon}
                </ListItemIcon>

                <ListItemText
                  primary={item.name}
                  primaryTypographyProps={{
                    fontSize: 14,
                    fontWeight: selected ? 600 : 500,
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        width: "100%",
        minHeight: "100vh",
        bgcolor: "#f8fafc",
      }}
    >
      {/* Header */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          height: headerHeight,
          bgcolor: "#ffffff",
          color: "#0f172a",
          borderBottom: "1px solid #e2e8f0",

          width: {
            xs: "100%",
            md: `calc(100% - ${drawerWidth}px)`,
          },

          ml: {
            xs: 0,
            md: `${drawerWidth}px`,
          },
        }}
      >
        <Toolbar
          sx={{
            minHeight: `${headerHeight}px !important`,
            height: headerHeight,
          }}
        >
          {/* Mobile menu */}
          <IconButton
            onClick={() => setMobileMenuOpen(true)}
            sx={{
              display: { xs: "inline-flex", md: "none" },
              mr: 1,
            }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            sx={{
              fontWeight: 600,
              fontSize: { xs: 16, sm: 18 },
              flexGrow: 1,
            }}
          >
            {activeMenu}
          </Typography>

          <Avatar
            sx={{
              ml: 1,
              width: 34,
              height: 34,
              bgcolor: "#dbeafe",
              color: "#1d4ed8",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            HR
          </Avatar>
        </Toolbar>
      </AppBar>

      {/* Desktop Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },

          width: drawerWidth,

          "& .MuiDrawer-paper": {
            width: drawerWidth,
            position: "fixed",
            top: `${headerHeight}px`,
            height: `calc(100vh - ${headerHeight}px)`,
            boxSizing: "border-box",
            borderRight: "1px solid #e2e8f0",
          },
        }}
      >
        {sidebar}
      </Drawer>

      {/* Mobile Sidebar */}
      <Drawer
        variant="temporary"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sx={{
          display: { xs: "block", md: "none" },

          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
      >
        {sidebar}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          width: {
            xs: "100%",
            md: `calc(100% - ${drawerWidth}px)`,
          },

          ml: {
            xs: 0,
            md: `${drawerWidth}px`,
          },

          pt: `${headerHeight}px`,
          minHeight: "100vh",
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 1600,
            mx: "auto",
            p: {
              xs: 2,
              sm: 3,
              md: 4,
            },
          }}
        >
          {activeMenu === "Dashboard" && <Dashboard />}
          {activeMenu === "Candidates" && <Candidates />}
        </Box>
      </Box>
    </Box>
  );
}

export default App;
